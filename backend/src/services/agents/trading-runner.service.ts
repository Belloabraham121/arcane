import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { createLogger } from "../../shared/logger";
import { findUserById } from "../auth/user.repository";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import type { QuickSwapPool } from "../defi/quickswap/types";
import { planRebalance } from "../defi/quickswap/route-planner";
import {
  buildTradingRecommendation,
  computeProactiveSwapAmount,
  pickSmartRebalancePair,
  proactiveDriftThresholdPercent,
} from "./trading-recommendations";
import { getWalletBalances } from "../wallet/token-balance.service";
import * as repo from "./strategy.repository";
import { persistTradingCycle } from "./trading.repository";
import {
  emitFromExecutedTransactions,
  emitFromToolOutcome,
  emitTradingCycleCompleted,
  emitTradingCycleStarted,
} from "../../websocket/trading-events";
import {
  runDualLlmTradingCycle,
  type DualLlmTradingCycleResult,
} from "./dual-llm-trading.service";
import { OpenAiTradingError } from "../openai/openai-trading.service";
import { resolveSubAgents } from "../somnia/quickswap-llm-tools";
import type {
  ExecutedTransaction,
  PoolAllocationDrift,
  TradingCyclePhase,
  TradingCycleSummary,
  TradingStatusResponse,
  TradingToolAction,
} from "./trading.types";
import type { PoolAllocations } from "./strategy.types";
import {
  assertCycleCooldown,
  assertPortfolioFunded,
  resolveRiskLimits,
  RiskControlError,
  type EffectiveRiskLimits,
} from "./risk-controls.service";
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

export type TradingCycleOverrides = {
  runDualLlmTradingCycle?: (
    input: Parameters<typeof runDualLlmTradingCycle>[0],
  ) => Promise<DualLlmTradingCycleResult>;
  listPoolsWithMetrics?: typeof listPoolsWithMetrics;
  getWalletBalances?: typeof getWalletBalances;
  /** Dev simulation: skip Somnia attestation, dry-run swaps. */
  simulation?: {
    dryRunTrades?: boolean;
    skipSomniaAttestation?: boolean;
  };
  /** Dev smoke: bypass TRADING_CYCLE_COOLDOWN_MINUTES. */
  skipCycleCooldown?: boolean;
};

/** Clears in-memory cycle state between integration tests. */
export function resetTradingRunnerStateForTests(): void {
  runningUsers.clear();
  lastCycleByUser.clear();
  lastErrorByUser.clear();
}

export function isUserCycleRunning(userId: string): boolean {
  return runningUsers.has(userId);
}

export function resolveCycleIntervalMinutes(input: {
  strategyType: "auto" | "custom";
  cycleIntervalMinutes: number | null;
  autoCycleIntervalMinutes: number;
  customCycleIntervalMinutes: number;
}): number {
  if (input.strategyType === "custom" && input.cycleIntervalMinutes != null) {
    return Math.max(5, Math.min(input.cycleIntervalMinutes, 24 * 60));
  }
  return input.strategyType === "auto"
    ? input.autoCycleIntervalMinutes
    : input.customCycleIntervalMinutes;
}
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

async function trySmartRebalance(input: {
  userId: string;
  walletAddress: Address;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: Awaited<ReturnType<typeof getWalletBalances>>;
  activePoolIds: string[];
  riskLimits: EffectiveRiskLimits;
}): Promise<{
  executedTransactions: ExecutedTransaction[];
  message?: string;
  poolFrom?: string;
  poolTo?: string;
}> {
  const recommendation = buildTradingRecommendation({
    poolDrift: input.poolDrift,
    pools: input.pools,
    balances: input.balances,
    riskLimits: input.riskLimits,
  });

  if (!recommendation.shouldTrade || !recommendation.toPoolId) {
    return {
      executedTransactions: [],
      message: recommendation.reason,
    };
  }

  const amount = recommendation.amountInRaw
    ? BigInt(recommendation.amountInRaw)
    : null;
  if (!amount || amount <= 0n) {
    return { executedTransactions: [] };
  }

  const plan = await planRebalance(
    recommendation.fromPoolId!,
    recommendation.toPoolId,
    amount,
    input.walletAddress,
    { pools: input.pools },
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
    riskLimits: input.riskLimits,
  });

  return {
    executedTransactions: toExecutedTransactions(txs),
    message: recommendation.reason,
    poolFrom: recommendation.fromPoolId,
    poolTo: recommendation.toPoolId,
  };
}

async function tryAutoRebalance(input: {
  userId: string;
  walletAddress: Address;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: Awaited<ReturnType<typeof getWalletBalances>>;
  activePoolIds: string[];
  riskLimits: EffectiveRiskLimits;
}): Promise<{
  executedTransactions: ExecutedTransaction[];
  message?: string;
  poolFrom?: string;
  poolTo?: string;
}> {
  const {
    maxSwapPortfolioBps,
    minSwapAmountRaw,
  } = input.riskLimits;

  const pair = pickSmartRebalancePair(
    input.poolDrift,
    input.pools,
    proactiveDriftThresholdPercent(input.riskLimits),
  );
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

  const amount = computeProactiveSwapAmount(
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
    { pools: input.pools },
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
    riskLimits: input.riskLimits,
  });

  return {
    executedTransactions: toExecutedTransactions(txs),
    message: `Rebalanced ${sourceToken.symbol} from ${fromPool.label} toward ${toPool.label} (agent wallet; no user approval).`,
    poolFrom: fromPool.id,
    poolTo: toPool.id,
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
 * Runs one trading cycle: portfolio snapshot → Somnia on-chain attestation → OpenAI decisions → tool execution.
 * Falls back to drift rebalance if OpenAI is unavailable.
 */
export async function runTradingCycle(
  userId: string,
  reason: TradingCycleSummary["reason"] = "manual",
  overrides?: TradingCycleOverrides,
): Promise<TradingCycleSummary> {
  const fetchPools = overrides?.listPoolsWithMetrics ?? listPoolsWithMetrics;
  const fetchBalances = overrides?.getWalletBalances ?? getWalletBalances;
  const invokeLlm = overrides?.runDualLlmTradingCycle ?? runDualLlmTradingCycle;
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

  emitTradingCycleStarted(userId, { cycleId, reason, startedAt });

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
      fetchPools(),
      fetchBalances(user.walletAddress as `0x${string}`, [...activePoolIds]),
    ]);

    const weights = balanceWeightsForPools(pools, activePoolIds, balances);
    const poolDrift = buildPoolDrift(poolAllocations, pools, weights);

    const hasBalance = balances.balances.some((b) => parseBalanceAmount(b.formatted) > 0);
    const finishedAt = new Date().toISOString();

    let executedTransactions: ExecutedTransaction[] = [];
    let toolActions: TradingToolAction[] = [];
    let llmResponse: string | null = null;
    let llmPending = true;
    let llmProvider: TradingCycleSummary["llmProvider"];
    let somniaAttestation: TradingCycleSummary["somniaAttestation"];
    let executionMessage: string | undefined;

    const subAgents = resolveSubAgents(
      strategy.strategyType,
      strategy.subAgentConfig,
    );
    const riskLimits = resolveRiskLimits(subAgents);

    if (!overrides?.skipCycleCooldown) {
      assertCycleCooldown(strategy.lastCycleAt, riskLimits, reason);
    }
    if (hasBalance) {
      assertPortfolioFunded(balances, riskLimits);
    }

    if (hasBalance) {
      try {
        const llm = await invokeLlm({
          userId,
          walletAddress: user.walletAddress as Address,
          strategyType: strategy.strategyType,
          depositAmount: strategy.depositAmount,
          lastCycleAt: strategy.lastCycleAt,
          poolAllocations,
          poolDrift,
          pools,
          balances,
          subAgents,
          activePoolIds: [...activePoolIds],
          riskLimits,
          dryRunTrades: overrides?.simulation?.dryRunTrades,
          skipSomniaAttestation: overrides?.simulation?.skipSomniaAttestation,
          onToolExecuted: (outcome) => {
            emitFromToolOutcome(userId, cycleId, outcome);
          },
        });

        executedTransactions = llm.executedTransactions;
        toolActions = llm.toolActions.map((action) => ({
          tool: action.tool,
          success: action.success,
          result: action.result,
        }));
        llmResponse = llm.llmResponse;
        llmPending = false;
        llmProvider = llm.provider;
        somniaAttestation = {
          status: llm.somniaAttestation.status,
          requestId: llm.somniaAttestation.requestId,
          txHash: llm.somniaAttestation.txHash,
          onChainResponse: llm.somniaAttestation.onChainResponse,
          message: llm.somniaAttestation.message,
        };
        executionMessage = llm.message;

        if (executedTransactions.length === 0) {
          try {
            const smart = await trySmartRebalance({
              userId,
              walletAddress: user.walletAddress as Address,
              poolDrift,
              pools,
              balances,
              activePoolIds: [...activePoolIds],
              riskLimits,
            });
            if (smart.executedTransactions.length > 0) {
              executedTransactions = smart.executedTransactions;
              emitFromExecutedTransactions(userId, cycleId, smart.executedTransactions, {
                poolFrom: smart.poolFrom ?? null,
                poolTo: smart.poolTo ?? null,
              });
              executionMessage = `OpenAI held — smart rebalance executed. ${smart.message ?? ""}`;
            } else if (smart.message) {
              log.info("Smart rebalance skipped", { userId, cycleId, reason: smart.message });
            }
          } catch (smartErr) {
            log.warn("Smart rebalance failed", {
              userId,
              cycleId,
              detail: smartErr instanceof Error ? smartErr.message : String(smartErr),
            });
          }
        }
      } catch (err) {
        const detail =
          err instanceof OpenAiTradingError
            ? err.message
            : err instanceof Error
              ? err.message
              : "LLM trading cycle failed";

        log.warn("LLM cycle failed — trying drift rebalance fallback", {
          userId,
          cycleId,
          detail,
        });

        try {
          const rebalance = await tryAutoRebalance({
            userId,
            walletAddress: user.walletAddress as Address,
            poolDrift,
            pools,
            balances,
            activePoolIds: [...activePoolIds],
            riskLimits,
          });
          executedTransactions = rebalance.executedTransactions;
          if (rebalance.executedTransactions.length > 0) {
            emitFromExecutedTransactions(userId, cycleId, rebalance.executedTransactions, {
              poolFrom: rebalance.poolFrom ?? null,
              poolTo: rebalance.poolTo ?? null,
            });
          }
          executionMessage =
            rebalance.executedTransactions.length > 0
              ? `${detail} — drift rebalance fallback executed.`
              : `${detail} — no fallback swap met threshold.`;
        } catch (fallbackErr) {
          const fallbackDetail =
            fallbackErr instanceof WalletExecutorError
              ? fallbackErr.message
              : fallbackErr instanceof Error
                ? fallbackErr.message
                : "Fallback rebalance failed";
          executionMessage = `${detail} — ${fallbackDetail}`;
        }
      }
    }

    const defaultMessage = hasBalance
      ? "Portfolio analyzed. OpenAI drives trading; Somnia on-chain agent attests integration."
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
      llmPending,
      llmResponse,
      llmProvider,
      somniaAttestation,
      toolActions: toolActions.length > 0 ? toolActions : undefined,
      message:
        executedTransactions.length > 0
          ? (executionMessage ?? "Trading actions executed by agent wallet.")
          : (executionMessage ?? defaultMessage),
    };

    await repo.touchLastCycleAt(strategy.id, new Date(finishedAt));

    try {
      await persistTradingCycle(summary, toolActions);
    } catch (persistErr) {
      const persistMessage =
        persistErr instanceof Error ? persistErr.message : String(persistErr);
      log.warn("Failed to persist trading cycle", {
        userId,
        cycleId,
        message: persistMessage,
      });
    }

    lastCycleByUser.set(userId, summary);

    emitTradingCycleCompleted(userId, {
      cycleId,
      reason,
      status: "completed",
      message: summary.message,
      llmResponse: summary.llmResponse ?? null,
      llmProvider: summary.llmProvider,
      somniaAttestation: summary.somniaAttestation
        ? {
            status: summary.somniaAttestation.status,
            requestId: summary.somniaAttestation.requestId,
            txHash: summary.somniaAttestation.txHash,
            message: summary.somniaAttestation.message,
          }
        : undefined,
      executedCount: summary.executedTransactions.length,
      finishedAt: summary.finishedAt,
    });

    log.info("Trading cycle completed", {
      userId,
      cycleId,
      reason,
      hasBalance,
      pools: activePoolIds.size,
    });

    return summary;
  } catch (err) {
    if (err instanceof RiskControlError) {
      throw new TradingError(err.code, err.message, err.status);
    }

    const message = err instanceof Error ? err.message : "Trading cycle failed";
    lastErrorByUser.set(userId, message);

    const failedSummary: TradingCycleSummary = {
      cycleId,
      userId,
      strategyId: "",
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      phase: "failed",
      message,
      walletAddress: "",
      depositAmount: 0,
      poolDrift: [],
      executedTransactions: [],
      llmPending: true,
    };

    try {
      const strategy = await repo.findStrategyByUserId(userId);
      if (strategy) {
        failedSummary.strategyId = strategy.id;
        failedSummary.depositAmount = strategy.depositAmount;
        const user = await findUserById(userId);
        if (user) {
          failedSummary.walletAddress = user.walletAddress;
        }
        await persistTradingCycle(failedSummary);
      }
    } catch (persistErr) {
      const persistMessage =
        persistErr instanceof Error ? persistErr.message : String(persistErr);
      log.warn("Failed to persist failed trading cycle", {
        userId,
        cycleId,
        message: persistMessage,
      });
    }

    emitTradingCycleCompleted(userId, {
      cycleId,
      reason,
      status: "failed",
      message,
      executedCount: 0,
      finishedAt: new Date().toISOString(),
    });

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
