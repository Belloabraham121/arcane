import type { Address } from "viem";
import { getQuickSwapTokenByAddress } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { SAMPLE_QUOTE_AMOUNT } from "./constants";
import {
  getKnownPoolById,
  getPoolByPair,
  getPoolState,
  listKnownPools,
} from "./pool-registry";
import { computeFeeAprPercent } from "./pool-ranking.service";
import { quoteExactIn } from "./quote.service";
import type {
  PoolMetrics,
  PoolOnChainState,
  QuickSwapPool,
  QuickSwapPoolToken,
  SwapQuote,
} from "./types";

const Q96 = 2n ** 96n;
const PRICE_PRECISION = 12n;
const MAX_SANE_PRICE = 1_000_000;
const MIN_SANE_PRICE = 1e-12;

export type PoolPriceInfo = {
  token1PerToken0: string | null;
  token0PerToken1: string | null;
};

export type EnrichedPoolView = QuickSwapPool & {
  sampleQuotes: SamplePoolQuote[];
};

export type SamplePoolQuote = {
  direction: string;
  amountIn: string;
  amountOut: string;
  fee: number;
};

/** Algebra lastFee 500 → 0.05% (fee / 1_000_000 × 100). */
export function feeTierToPercent(lastFee: number): number {
  return (lastFee / 1_000_000) * 100;
}

export function isSanePriceString(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > MIN_SANE_PRICE && n < MAX_SANE_PRICE;
}

/** Format a human token amount for UI (handles tiny swap rates like USDCe→WETH). */
export function formatHumanTokenAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  if (value >= 1_000_000) {
    return value.toExponential(4);
  }
  if (value >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  if (value >= 0.0001) {
    const fixed = value.toFixed(8);
    return fixed.replace(/\.?0+$/, "");
  }
  return value.toPrecision(4);
}

function humanAmountFromBaseUnits(amount: bigint, decimals: number): number {
  const scale = 10 ** decimals;
  return Number(amount) / scale;
}

/**
 * Price ratio from sqrtPriceX96 (Q64.96).
 * Returns human-readable amounts: token1 per 1 token0, and inverse.
 */
export function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint | string,
  decimals0: number,
  decimals1: number,
): PoolPriceInfo {
  const sqrtP = BigInt(sqrtPriceX96);
  const denom = Q96 * Q96 * 10n ** BigInt(decimals1);

  const token1PerToken0Scaled =
    denom > 0n
      ? (sqrtP * sqrtP * 10n ** (BigInt(decimals0) + PRICE_PRECISION)) / denom
      : 0n;

  const token0PerToken1Scaled =
    token1PerToken0Scaled > 0n
      ? (10n ** (PRICE_PRECISION * 2n)) / token1PerToken0Scaled
      : 0n;

  const token1PerToken0 = formatScaledRatio(token1PerToken0Scaled);
  const token0PerToken1 = formatScaledRatio(token0PerToken1Scaled);

  return {
    token1PerToken0: isSanePriceString(token1PerToken0) ? token1PerToken0 : null,
    token0PerToken1: isSanePriceString(token0PerToken1) ? token0PerToken1 : null,
  };
}

function formatScaledRatio(value: bigint): string {
  if (value === 0n) {
    return "0";
  }
  const scale = 10n ** PRICE_PRECISION;
  const whole = value / scale;
  if (whole > 10n ** 12n) {
    return "0";
  }
  const frac = value % scale;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(Number(PRICE_PRECISION), "0");
  const trimmed = fracStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

export function pickPriceLabel(
  token0: QuickSwapPoolToken,
  token1: QuickSwapPoolToken,
  prices: PoolPriceInfo,
): string | null {
  if (prices.token1PerToken0) {
    return `1 ${token0.symbol} ≈ ${formatHumanTokenAmount(Number(prices.token1PerToken0))} ${token1.symbol}`;
  }
  if (prices.token0PerToken1) {
    return `1 ${token1.symbol} ≈ ${formatHumanTokenAmount(Number(prices.token0PerToken1))} ${token0.symbol}`;
  }
  return null;
}

async function spotPriceLabelFromQuote(
  token0: QuickSwapPoolToken,
  token1: QuickSwapPoolToken,
): Promise<string | null> {
  const candidates: Array<{
    tokenIn: QuickSwapPoolToken;
    tokenOut: QuickSwapPoolToken;
    amountIn: bigint;
  }> = [];

  const amount0 = SAMPLE_QUOTE_AMOUNT[token0.symbol];
  if (amount0) {
    candidates.push({ tokenIn: token0, tokenOut: token1, amountIn: amount0 });
  }
  const amount1 = SAMPLE_QUOTE_AMOUNT[token1.symbol];
  if (amount1) {
    candidates.push({ tokenIn: token1, tokenOut: token0, amountIn: amount1 });
  }

  for (const { tokenIn, tokenOut, amountIn } of candidates) {
    try {
      const quote = await quoteExactIn(tokenIn.address, tokenOut.address, amountIn);
      const inHuman = humanAmountFromBaseUnits(BigInt(quote.amountIn), tokenIn.decimals);
      const outHuman = humanAmountFromBaseUnits(BigInt(quote.amountOut), tokenOut.decimals);
      if (inHuman <= 0 || outHuman <= 0) {
        continue;
      }
      const perOne = outHuman / inHuman;
      if (perOne > MIN_SANE_PRICE && perOne < MAX_SANE_PRICE) {
        return `1 ${tokenIn.symbol} ≈ ${formatHumanTokenAmount(perOne)} ${tokenOut.symbol}`;
      }
    } catch {
      // try next direction
    }
  }

  return null;
}

async function resolvePriceLabel(
  token0: QuickSwapPoolToken,
  token1: QuickSwapPoolToken,
  prices: PoolPriceInfo,
): Promise<string | null> {
  const fromSqrt = pickPriceLabel(token0, token1, prices);
  if (fromSqrt) {
    return fromSqrt;
  }
  return spotPriceLabelFromQuote(token0, token1);
}

export function enrichMetricsFromState(
  state: PoolOnChainState,
  token0: QuickSwapPoolToken,
  token1: QuickSwapPoolToken,
): PoolMetrics {
  const prices = priceFromSqrtPriceX96(
    state.globalState.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );

  return {
    sqrtPriceX96: state.globalState.sqrtPriceX96,
    tick: state.globalState.tick,
    liquidity: state.liquidity,
    reserve0: state.reserve0,
    reserve1: state.reserve1,
    lastFee: state.globalState.lastFee,
    token1PerToken0: prices.token1PerToken0,
    token0PerToken1: prices.token0PerToken1,
    priceLabel: pickPriceLabel(token0, token1, prices),
    feeTierPercent: feeTierToPercent(state.globalState.lastFee),
    feeApr: null,
    totalValueLockedUsd: null,
    volumeUsd: null,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getPoolMetrics(poolAddress: Address): Promise<PoolMetrics> {
  const { chainId } = getQuickSwapEnv();
  const state = await getPoolState(poolAddress);

  const token0: QuickSwapPoolToken = resolveToken(chainId, state.token0);
  const token1: QuickSwapPoolToken = resolveToken(chainId, state.token1);

  const metrics = enrichMetricsFromState(state, token0, token1);

  if (!metrics.priceLabel) {
    const priceLabel = await resolvePriceLabel(token0, token1, {
      token1PerToken0: metrics.token1PerToken0,
      token0PerToken1: metrics.token0PerToken1,
    });
    return { ...metrics, priceLabel };
  }

  return metrics;
}

function resolveToken(chainId: number, address: Address): QuickSwapPoolToken {
  const known = getQuickSwapTokenByAddress(chainId, address);
  if (known) {
    return {
      address: known.address,
      symbol: known.symbol,
      name: known.name,
      decimals: known.decimals,
    };
  }
  return {
    address,
    symbol: address.slice(2, 8),
    name: "Unknown token",
    decimals: 18,
  };
}

function sampleAmountFor(symbol: string): bigint | null {
  return SAMPLE_QUOTE_AMOUNT[symbol] ?? null;
}

async function sampleQuotesForPool(pool: QuickSwapPool): Promise<SamplePoolQuote[]> {
  const samples: SamplePoolQuote[] = [];

  const forwardAmount = sampleAmountFor(pool.token0.symbol);
  if (forwardAmount) {
    try {
      const q = await quoteExactIn(pool.token0.address, pool.token1.address, forwardAmount);
      samples.push(toSampleQuote(`${pool.token0.symbol}→${pool.token1.symbol}`, q));
    } catch {
      // Pool may have no liquidity in this direction
    }
  }

  const reverseAmount = sampleAmountFor(pool.token1.symbol);
  if (reverseAmount) {
    try {
      const q = await quoteExactIn(pool.token1.address, pool.token0.address, reverseAmount);
      samples.push(toSampleQuote(`${pool.token1.symbol}→${pool.token0.symbol}`, q));
    } catch {
      // ignore
    }
  }

  return samples;
}

function toSampleQuote(direction: string, quote: SwapQuote): SamplePoolQuote {
  return {
    direction,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    fee: quote.fee,
  };
}

function mergeSubgraphVolume(metrics: PoolMetrics, pool: QuickSwapPool): PoolMetrics {
  const merged: PoolMetrics = {
    ...metrics,
    totalValueLockedUsd: pool.metrics.totalValueLockedUsd,
    volumeUsd: pool.metrics.volumeUsd,
  };
  const apy = computeFeeAprPercent({ ...pool, metrics: merged });
  return {
    ...merged,
    feeApr: apy > 0 ? apy : merged.feeApr,
  };
}

async function metricsForPoolAddress(
  poolAddress: Address,
  pool: QuickSwapPool,
): Promise<PoolMetrics | null> {
  try {
    return mergeSubgraphVolume(await getPoolMetrics(poolAddress), pool);
  } catch {
    return null;
  }
}

async function enrichPoolMetrics(pool: QuickSwapPool): Promise<QuickSwapPool> {
  const direct = await metricsForPoolAddress(pool.address, pool);
  if (direct) {
    return { ...pool, metrics: direct };
  }

  const canonical = await getPoolByPair(pool.token0.address, pool.token1.address);
  if (canonical) {
    const canonicalMetrics = await metricsForPoolAddress(canonical, pool);
    if (canonicalMetrics) {
      return { ...pool, metrics: canonicalMetrics };
    }
  }

  const token0 = pool.token0;
  const token1 = pool.token1;
  const prices = priceFromSqrtPriceX96(
    pool.metrics.sqrtPriceX96,
    token0.decimals,
    token1.decimals,
  );
  const metrics: PoolMetrics = {
    ...pool.metrics,
    token1PerToken0: prices.token1PerToken0,
    token0PerToken1: prices.token0PerToken1,
    priceLabel: pickPriceLabel(token0, token1, prices),
  };
  return { ...pool, metrics };
}

/** All known pools with live price metrics (no sample quotes — use getEnrichedPool for those). */
export async function listPoolsWithMetrics(): Promise<QuickSwapPool[]> {
  const pools = await listKnownPools();
  return Promise.all(pools.map(enrichPoolMetrics));
}

/** Pool with enriched price metrics and optional sample swap quotes. */
export async function getEnrichedPool(poolId: string): Promise<EnrichedPoolView | null> {
  const pool = await getKnownPoolById(poolId);
  if (!pool) {
    return null;
  }

  const enriched = await enrichPoolMetrics(pool);
  const sampleQuotes = await sampleQuotesForPool(enriched);

  return {
    ...enriched,
    sampleQuotes,
  };
}
