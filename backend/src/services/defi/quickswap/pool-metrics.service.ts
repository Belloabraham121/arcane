import type { Address } from "viem";
import { getQuickSwapTokenByAddress } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { SAMPLE_QUOTE_AMOUNT } from "./constants";
import { getPoolState, getKnownPoolById } from "./pool-registry";
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

export type PoolPriceInfo = {
  token1PerToken0: string;
  token0PerToken1: string;
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

  return {
    token1PerToken0: formatScaledRatio(token1PerToken0Scaled),
    token0PerToken1: formatScaledRatio(token0PerToken1Scaled),
  };
}

function formatScaledRatio(value: bigint): string {
  if (value === 0n) {
    return "0";
  }
  const scale = 10n ** PRICE_PRECISION;
  const whole = value / scale;
  const frac = value % scale;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(Number(PRICE_PRECISION), "0");
  const trimmed = fracStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
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
    feeTierPercent: feeTierToPercent(state.globalState.lastFee),
    feeApr: null,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getPoolMetrics(poolAddress: Address): Promise<PoolMetrics> {
  const { chainId } = getQuickSwapEnv();
  const state = await getPoolState(poolAddress);

  const token0: QuickSwapPoolToken = resolveToken(chainId, state.token0);
  const token1: QuickSwapPoolToken = resolveToken(chainId, state.token1);

  return enrichMetricsFromState(state, token0, token1);
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

/** Pool with enriched price metrics and optional sample swap quotes. */
export async function getEnrichedPool(poolId: string): Promise<EnrichedPoolView | null> {
  const pool = await getKnownPoolById(poolId);
  if (!pool) {
    return null;
  }

  const metrics = await getPoolMetrics(pool.address);
  const sampleQuotes = await sampleQuotesForPool({
    ...pool,
    metrics,
  });

  return {
    ...pool,
    metrics,
    sampleQuotes,
  };
}
