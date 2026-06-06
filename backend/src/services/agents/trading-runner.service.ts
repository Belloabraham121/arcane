import { randomUUID } from "node:crypto";
import { createLogger } from "../../shared/logger";
import { findUserById } from "../auth/user.repository";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import { getWalletBalances } from "../wallet/token-balance.service";
import * as repo from "./strategy.repository";
import type {
  PoolAllocationDrift,
  TradingCyclePhase,
  TradingCycleSummary,
  TradingStatusResponse,
} from "./trading.types";
import type { PoolAllocations } from "./strategy.types";

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
      llmPending: true,
      message: hasBalance
        ? "Portfolio analyzed. LLM rebalance execution arrives in Phase 4."
        : "No on-chain balance detected yet — deposit to the agent wallet, then run another cycle.",
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
