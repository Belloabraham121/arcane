import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { getTradingExecutionEnv } from "../../config/env";
import { createLogger } from "../../shared/logger";
import { findUserById } from "../auth/user.repository";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import type { QuickSwapPool } from "../defi/quickswap/types";
import { planRebalance } from "../defi/quickswap/route-planner";
import { getWalletBalances } from "../wallet/token-balance.service";
import * as repo from "./strategy.repository";
import type {
  ExecutedTransaction,
  PoolAllocationDrift,
  TradingCyclePhase,
  TradingCycleSummary,
  TradingStatusResponse,
} from "./trading.types";
import type { PoolAllocations } from "./strategy.types";
import {
  executeRebalancePlan,
  WalletExecutorError,
} from "./wallet-executor";

const log = createLogger("trading-runner");

export class TradingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "TradingError";
  }
}

const runningUsers = new Set<string>();
const lastCycleByUser = new Map<string, TradingCycleSummary>();
const lastErrorByUser = new Map<string, string>();

function poolAllocationsFromRows(
  rows: { poolId: string; amount: number }[],
): PoolAllocations {
  const map = {} as PoolAllocations;
  for (const row of rows) {
    map[row.poolId as keyof PoolAllocations] = row.amount;
  }
  return map;
}

function parseBalanceAmount(formatted: string): number {
  const n = Number(formatted);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildPoolDrift(
  poolAllocations: PoolAllocations,
  pools: Awaited<ReturnType<typeof listPoolsWithMetrics>>,
  balanceWeights: Map<string, number>,
): PoolAllocationDrift[] {
  const allocationTotal = Object.values(poolAllocations).reduce((sum, v) => sum + v, 0);
  const weightTotal = [...balanceWeights.values()].reduce((sum, v) => sum + v, 0);

  const activePoolIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);

  return activePoolIds.map((poolId) => {
    const pool = pools.find((p) => p.id === poolId);
    const targetAmount = poolAllocations[poolId as keyof PoolAllocations] ?? 0;
    const targetPercent =
      allocationTotal > 0 ? (targetAmount / allocationTotal) * 100 : 0;

    const poolWeight =
      (balanceWeights.get(`${poolId}:token0`) ?? 0) +
      (balanceWeights.get(`${poolId}:token1`) ?? 0);
    const currentPercent = weightTotal > 0 ? (poolWeight / weightTotal) * 100 : 0;

    return {
      poolId,
      label: pool?.label ?? poolId,
      targetPercent,
      currentPercent,
      driftPercent: currentPercent - targetPercent,
    };
  });
}

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
  const candidates = [fromPool.token0, fromPool.token1];
  return (
    candidates.find((token) => !toAddresses.has(normalizeAddress(token.address))) ??
    null
  );
}

function pickRebalancePools(
  drift: PoolAllocationDrift[],
  thresholdPercent: number,
): { fromPoolId: string; toPoolId: string } | null {
  const overweight = drift
    .filter((entry) => entry.driftPercent > thresholdPercent)
    .sort((a, b) => b.driftPercent - a.driftPercent)[0];
  const underweight = drift
    .filter((entry) => entry.driftPercent < -thresholdPercent)
    .sort((a, b) => a.driftPercent - b.driftPercent)[0];

  if (!overweight || !underweight) {
    return null;
  }

  return {
    fromPoolId: overweight.poolId,
    toPoolId: underweight.poolId,
  };
}

function computeSwapAmount(
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
      Math.max(Math.round(overweightDriftPercent * 100), 0),
      maxSwapPortfolioBps,
    ),
  );
  if (driftBps === 0n) {
    return null;
  }

  const amount = (balance * driftBps) / 10_000n;
  if (amount < minSwapAmountRaw) {
    return null;
  }

  return amount;
}

function toExecutedTransactions(
  txs: Awaited<ReturnType<typeof executeRebalancePlan>>,
): ExecutedTransaction[] {
  return txs.map((tx) => ({
    kind: tx.kind,
    hash: tx.hash,
    status: tx.status,
    tokenIn: tx.tokenIn,
    tokenOut: tx.tokenOut,
    amountIn: tx.amountIn?.toString(),
    amountOut: tx.amountOut?.toString(),
  }));
}

async function tryAutoRebalance(input: {
  userId: string;
  walletAddress: Address;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: Awaited<ReturnType<typeof getWalletBalances>>;
  activePoolIds: string[];
}): Promise<{
  executedTransactions: ExecutedTransaction[];
  message?: string;
}> {
  const {
    driftThresholdPercent,
    maxSwapPortfolioBps,
    minSwapAmountRaw,
  } = getTradingExecutionEnv();

  const pair = pickRebalancePools(input.poolDrift, driftThresholdPercent);
  if (!pair) {
    return { executedTransactions: [] };
  }

  const fromPool = input.pools.find((pool) => pool.id === pair.fromPoolId);
  const toPool = input.pools.find((pool) => pool.id === pair.toPoolId);
  if (!fromPool || !toPool) {
    return { executedTransactions: [] };
  }

  const sourceToken = exclusivePoolToken(fromPool, toPool);
  if (!sourceToken) {
    return {
      executedTransactions: [],
      message: "Pools share the same tokens — no on-chain swap required.",
    };
  }

  const overweight = input.poolDrift.find(
    (entry) => entry.poolId === pair.fromPoolId,
  );
  if (!overweight) {
    return { executedTransactions: [] };
  }

  const balanceRow = input.balances.balances.find(
    (entry) => entry.symbol === sourceToken.symbol,
  );
  if (!balanceRow) {
    return { executedTransactions: [] };
  }

  const amount = computeSwapAmount(
    balanceRow.balance,
    overweight.driftPercent,
    maxSwapPortfolioBps,
    minSwapAmountRaw,
  );
  if (!amount) {
    return { executedTransactions: [] };
  }

  const plan = await planRebalance(
    pair.fromPoolId,
    pair.toPoolId,
    amount,
    input.walletAddress,
  );

  if (plan.kind === "no_swap") {
    return {
      executedTransactions: [],
      message: plan.reason,
    };
  }

  const txs = await executeRebalancePlan({
    userId: input.userId,
    plan,
    allowedPoolIds: input.activePoolIds,
  });

  return {
    executedTransactions: toExecutedTransactions(txs),
    message: `Rebalanced ${sourceToken.symbol} from ${fromPool.label} toward ${toPool.label} (agent wallet; no user approval).`,
  };
}

function balanceWeightsForPools(
  pools: Awaited<ReturnType<typeof listPoolsWithMetrics>>,
  activePoolIds: Set<string>,
  balances: Awaited<ReturnType<typeof getWalletBalances>>,
): Map<string, number> {
  const bySymbol = new Map(balances.balances.map((b) => [b.symbol, parseBalanceAmount(b.formatted)]));
  const weights = new Map<string, number>();

  for (const pool of pools) {
    if (!activePoolIds.has(pool.id)) {
      continue;
    }
    const w0 = bySymbol.get(pool.token0.symbol) ?? 0;
    const w1 = bySymbol.get(pool.token1.symbol) ?? 0;
    weights.set(`${pool.id}:token0`, w0);
    weights.set(`${pool.id}:token1`, w1);
  }

  return weights;
}

export function getTradingStatus(userId: string): TradingStatusResponse {
  const phase: TradingCyclePhase = runningUsers.has(userId)
    ? "analyzing"
    : lastErrorByUser.get(userId)
      ? "failed"
      : lastCycleByUser.has(userId)
        ? "completed"
        : "idle";

  return {
    phase,
    tradingEnabledAt: null,
    lastCycleAt: null,
    lastCycle: lastCycleByUser.get(userId) ?? null,
    lastError: lastErrorByUser.get(userId) ?? null,
  };
}

export async function getTradingStatusForUser(
  userId: string,
): Promise<TradingStatusResponse> {
  const strategy = await repo.findStrategyByUserId(userId);
  const base = getTradingStatus(userId);

  if (!strategy) {
    return base;
  }

  return {
    ...base,
    tradingEnabledAt: strategy.tradingEnabledAt?.toISOString() ?? null,
    lastCycleAt: strategy.lastCycleAt?.toISOString() ?? null,
  };
}

/**
 * Runs one trading cycle: portfolio snapshot, drift vs pool targets, updates lastCycleAt.
 * LLM + swap execution wired in Phase 4/3 (llmPending=true until then).
 */
export async function runTradingCycle(
  userId: string,
  reason: TradingCycleSummary["reason"] = "manual",
): Promise<TradingCycleSummary> {
  if (runningUsers.has(userId)) {
    throw new TradingError(
      "CYCLE_IN_PROGRESS",
      "A trading cycle is already running for this user",
      409,
    );
  }

  runningUsers.add(userId);
  lastErrorByUser.delete(userId);

  const cycleId = randomUUID();
  const startedAt = new Date().toISOString();

  try {
    const strategy = await repo.findStrategyByUserId(userId);
    if (!strategy) {
      throw new TradingError("STRATEGY_NOT_FOUND", "No agent strategy found", 404);
    }
    if (strategy.status !== "active") {
      throw new TradingError(
        "STRATEGY_NOT_ACTIVE",
        "Strategy must be active to run a trading cycle",
      );
    }
    if (strategy.depositAmount <= 0) {
      throw new TradingError(
        "DEPOSIT_REQUIRED",
        "Deposit funds to the agent wallet before trading",
      );
    }

    const user = await findUserById(userId);
    if (!user) {
      throw new TradingError("USER_NOT_FOUND", "User not found", 404);
    }

    const poolAllocations = poolAllocationsFromRows(strategy.poolAllocations);
    const activePoolIds = new Set(
      Object.entries(poolAllocations)
        .filter(([, amount]) => amount > 0)
        .map(([id]) => id),
    );

    const [pools, balances] = await Promise.all([
      listPoolsWithMetrics(),
      getWalletBalances(user.walletAddress as `0x${string}`, [...activePoolIds]),
    ]);

    const weights = balanceWeightsForPools(pools, activePoolIds, balances);
    const poolDrift = buildPoolDrift(poolAllocations, pools, weights);

    const hasBalance = balances.balances.some((b) => parseBalanceAmount(b.formatted) > 0);
    const finishedAt = new Date().toISOString();

    let executedTransactions: ExecutedTransaction[] = [];
    let executionMessage: string | undefined;

    if (hasBalance) {
      try {
        const rebalance = await tryAutoRebalance({
          userId,
          walletAddress: user.walletAddress as Address,
          poolDrift,
          pools,
          balances,
          activePoolIds: [...activePoolIds],
        });
        executedTransactions = rebalance.executedTransactions;
        executionMessage = rebalance.message;
      } catch (err) {
        const detail =
          err instanceof WalletExecutorError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Auto-rebalance failed";
        log.warn("Auto-rebalance skipped", { userId, cycleId, detail });
        executionMessage = detail;
      }
    }

    const defaultMessage = hasBalance
      ? "Portfolio analyzed. Drift rebalance runs automatically when threshold is exceeded."
      : "No on-chain balance detected yet — deposit to the agent wallet, then run another cycle.";

    const summary: TradingCycleSummary = {
      cycleId,
      userId,
      strategyId: strategy.id,
      reason,
      startedAt,
      finishedAt,
      phase: "completed",
      walletAddress: user.walletAddress,
      depositAmount: strategy.depositAmount,
      poolDrift,
      executedTransactions,
      llmPending: true,
      message:
        executedTransactions.length > 0
          ? (executionMessage ?? "Rebalance swap executed by agent wallet.")
          : (executionMessage ?? defaultMessage),
    };

    await repo.touchLastCycleAt(strategy.id, new Date(finishedAt));

    lastCycleByUser.set(userId, summary);

    log.info("Trading cycle completed", {
      userId,
      cycleId,
      reason,
      hasBalance,
      pools: activePoolIds.size,
    });

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading cycle failed";
    lastErrorByUser.set(userId, message);
    log.error("Trading cycle failed", { userId, cycleId, reason, message });
    throw err;
  } finally {
    runningUsers.delete(userId);
  }
}

/** Fire-and-forget first cycle after activation (does not block HTTP response). */
export function scheduleTradingCycle(
  userId: string,
  reason: TradingCycleSummary["reason"] = "activation",
): void {
  void runTradingCycle(userId, reason).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Scheduled trading cycle failed", { userId, reason, message });
  });
}

export function shouldTriggerCycleOnActivate(
  previousStatus: string | undefined,
  previousLastCycleAt: Date | null | undefined,
  nextStatus: string,
  depositAmount: number,
): boolean {
  return (
    nextStatus === "active" &&
    depositAmount > 0 &&
    (previousStatus !== "active" || previousLastCycleAt == null)
  );
}
