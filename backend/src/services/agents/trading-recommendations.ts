import type { Address } from "viem";
import { formatAmountHint } from "../../utils/token-amount";
import { getTradingExecutionEnv } from "../../config/env";
import {
  liquidPoolsOnly,
  poolHasTradeableLiquidity,
} from "../defi/quickswap/route-planner";
import type { PlanRebalanceOptions } from "../defi/quickswap/route-planner";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import type { PoolAllocationDrift } from "./trading.types";
import type { EffectiveRiskLimits } from "./risk-controls.types";

export type TradingRecommendation = {
  shouldTrade: boolean;
  reason: string;
  suggestedTool: "swapExactIn" | "rebalanceToPool" | "hold";
  fromPoolId?: string;
  toPoolId?: string;
  tokenIn?: { address: Address; symbol: string };
  /** Set when pools share the same pair — explicit swap leg for planRebalance. */
  tokenOut?: { address: Address; symbol: string };
  amountInRaw?: string;
  /** Human-readable hint — do NOT pass this to tools; use amountInRaw only. */
  amountInHint?: string;
  tokenDecimals?: number;
  tradeablePoolIds: string[];
};

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
}

function exclusivePoolToken(
  fromPool: QuickSwapPool,
  toPool: QuickSwapPool,
): QuickSwapPool["token0"] | null {
  const toAddresses = new Set(
    [toPool.token0.address, toPool.token1.address].map(normalizeAddress),
  );
  return (
    [fromPool.token0, fromPool.token1].find(
      (token) => !toAddresses.has(normalizeAddress(token.address)),
    ) ?? null
  );
}

/** When pools share the same pair, swap the heavier wallet leg toward the lighter. */
export function pickSamePairSwapLeg(
  pool: QuickSwapPool,
  balances: WalletBalancesResult,
): { tokenIn: QuickSwapPool["token0"]; tokenOut: QuickSwapPool["token0"] } | null {
  const bal0 = balances.balances.find(
    (row) =>
      row.address &&
      normalizeAddress(row.address) === normalizeAddress(pool.token0.address),
  );
  const bal1 = balances.balances.find(
    (row) =>
      row.address &&
      normalizeAddress(row.address) === normalizeAddress(pool.token1.address),
  );
  const raw0 = BigInt(bal0?.balance ?? "0");
  const raw1 = BigInt(bal1?.balance ?? "0");
  if (raw0 <= 0n && raw1 <= 0n) {
    return null;
  }
  if (raw0 >= raw1) {
    return { tokenIn: pool.token0, tokenOut: pool.token1 };
  }
  return { tokenIn: pool.token1, tokenOut: pool.token0 };
}

export function pickSmartRebalancePair(
  drift: PoolAllocationDrift[],
  pools: readonly QuickSwapPool[],
  thresholdPercent: number,
): { fromPoolId: string; toPoolId: string } | null {
  const liquidIds = new Set(liquidPoolsOnly(pools).map((pool) => pool.id));
  const resolvableIds = new Set(pools.map((pool) => pool.id));

  const overweight = drift
    .filter(
      (entry) =>
        entry.driftPercent > thresholdPercent &&
        resolvableIds.has(entry.poolId) &&
        liquidIds.has(entry.poolId),
    )
    .sort((a, b) => b.driftPercent - a.driftPercent)[0];

  const underweightByDrift = drift
    .filter(
      (entry) =>
        entry.driftPercent < -thresholdPercent &&
        resolvableIds.has(entry.poolId),
    )
    .sort((a, b) => a.driftPercent - b.driftPercent)[0];

  const underweight =
    underweightByDrift ??
    drift
      .filter((entry) => resolvableIds.has(entry.poolId))
      .sort(
        (a, b) =>
          b.targetPercent -
          b.currentPercent -
          (a.targetPercent - a.currentPercent),
      )[0];

  if (!overweight || !underweight || overweight.poolId === underweight.poolId) {
    return null;
  }

  return {
    fromPoolId: overweight.poolId,
    toPoolId: underweight.poolId,
  };
}

export function computeProactiveSwapAmount(
  tokenBalanceRaw: string,
  overweightDriftPercent: number,
  maxSwapPortfolioBps: number,
  minSwapAmountRaw: bigint,
): bigint | null {
  const balance = BigInt(tokenBalanceRaw);
  if (balance <= 0n) {
    return null;
  }

  const driftBps = BigInt(
    Math.min(
      Math.max(Math.round(Math.abs(overweightDriftPercent) * 100), 100),
      maxSwapPortfolioBps,
    ),
  );

  const amount = (balance * driftBps) / 10_000n;
  if (amount < minSwapAmountRaw) {
    return null;
  }

  return amount;
}

export function rebalancePlanOptions(
  recommendation: TradingRecommendation,
  pools: QuickSwapPool[],
): PlanRebalanceOptions {
  const options: PlanRebalanceOptions = { pools };
  if (recommendation.tokenIn?.address) {
    options.tokenIn = recommendation.tokenIn.address;
  }
  if (recommendation.tokenOut?.address) {
    options.tokenOut = recommendation.tokenOut.address;
  }
  return options;
}

export function proactiveDriftThresholdPercent(
  riskLimits: EffectiveRiskLimits,
): number {
  const env = getTradingExecutionEnv();
  const proactive = Number(
    process.env.TRADING_PROACTIVE_DRIFT_PERCENT ??
      String(Math.min(env.driftThresholdPercent, 2)),
  );
  return Math.min(riskLimits.driftThresholdPercent, proactive);
}

/** Actionable trade hint for the LLM and deterministic fallback executor. */
export function buildTradingRecommendation(input: {
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  riskLimits: EffectiveRiskLimits;
}): TradingRecommendation {
  const tradeablePoolIds = liquidPoolsOnly(input.pools).map((pool) => pool.id);
  const threshold = proactiveDriftThresholdPercent(input.riskLimits);

  const pair = pickSmartRebalancePair(
    input.poolDrift,
    input.pools,
    threshold,
  );

  if (!pair) {
    return {
      shouldTrade: false,
      reason: `No pool pair exceeds proactive drift threshold (${threshold}%).`,
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const fromPool = input.pools.find((pool) => pool.id === pair.fromPoolId);
  const toPool = input.pools.find((pool) => pool.id === pair.toPoolId);
  if (!fromPool || !toPool) {
    return {
      shouldTrade: false,
      reason: "Rebalance pair could not be resolved to pool metadata.",
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const overweight = input.poolDrift.find(
    (entry) => entry.poolId === pair.fromPoolId,
  );
  if (!overweight) {
    return {
      shouldTrade: false,
      reason: "Overweight pool drift entry missing.",
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const exclusiveToken = exclusivePoolToken(fromPool, toPool);
  const samePairLeg = exclusiveToken
    ? null
    : pickSamePairSwapLeg(fromPool, input.balances);
  const sourceToken = exclusiveToken ?? samePairLeg?.tokenIn ?? null;
  const targetToken = exclusiveToken
    ? null
    : (samePairLeg?.tokenOut ?? null);

  if (!sourceToken) {
    return {
      shouldTrade: false,
      reason: "Pools share the same tokens but no wallet balance is available to swap.",
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const balanceRow = input.balances.balances.find(
    (row) => row.symbol === sourceToken.symbol,
  );
  if (!balanceRow) {
    return {
      shouldTrade: false,
      reason: `No ${sourceToken.symbol} balance to sell.`,
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const amount = computeProactiveSwapAmount(
    balanceRow.balance,
    overweight.driftPercent,
    input.riskLimits.maxSwapPortfolioBps,
    input.riskLimits.minSwapAmountRaw,
  );

  if (!amount) {
    return {
      shouldTrade: false,
      reason: "Swap amount is below minimum after risk caps.",
      suggestedTool: "hold",
      tradeablePoolIds,
    };
  }

  const targetTradeable = poolHasTradeableLiquidity(toPool);
  const targetNote = targetTradeable
    ? ""
    : ` Target pool ${toPool.id} has zero liquidity — route via other liquid pools only.`;

  const samePairNote = targetToken
    ? ` Same token pair — swap ${sourceToken.symbol}→${targetToken.symbol} to shift exposure.`
    : "";

  return {
    shouldTrade: true,
    reason: `Drift exceeds ${threshold}%: reduce ${fromPool.label} (+${overweight.driftPercent.toFixed(2)}%) toward ${toPool.label}.${samePairNote}${targetNote}`,
    suggestedTool: "rebalanceToPool",
    fromPoolId: pair.fromPoolId,
    toPoolId: pair.toPoolId,
    tokenIn: {
      address: sourceToken.address,
      symbol: sourceToken.symbol,
    },
    tokenOut: targetToken
      ? { address: targetToken.address, symbol: targetToken.symbol }
      : undefined,
    amountInRaw: amount.toString(),
    amountInHint: formatAmountHint(
      amount,
      sourceToken.decimals,
      sourceToken.symbol,
    ),
    tokenDecimals: sourceToken.decimals,
    tradeablePoolIds,
  };
}
