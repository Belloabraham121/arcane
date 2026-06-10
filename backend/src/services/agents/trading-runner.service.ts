import { randomUUID } from "node:crypto";
import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { getServerEnv } from "../../config/env";
import { createLogger } from "../../shared/logger";
import { findUserById } from "../auth/user.repository";
import {
  acquireDemoCycleLock,
  DEMO_WALLET_NOTICE,
  isDemoWalletCycleRunning,
  releaseDemoCycleLock,
  resetDemoCycleMutexForTests,
} from "./demo-cycle-mutex.service";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import type { QuickSwapPool } from "../defi/quickswap/types";
import { planRebalance } from "../defi/quickswap/route-planner";
import {
  buildTradingRecommendation,
  rebalancePlanOptions,
  resetExploratoryRotation,
  resolveAllocationMode,
} from "./trading-recommendations";
import { schedulePortfolioSnapshot } from "../portfolio/snapshot.service";
import { getDemoEnv } from "../../config/env";
import {
  AnvilForkUnhealthyError,
  assertTradingRpcHealthy,
  ensureDemoTradingWalletFunded,
  getDemoTradingAvailability,
  resolveTradingRpc,
  resolveTradingWallet,
  TradingDemoDisabledError,
  withDemoAgentSigning,
  withTradingRpc,
} from "./trading-wallet-context.service";
import { getWalletBalances } from "../wallet/token-balance.service";
import * as repo from "./strategy.repository";
import {
  findLatestTradingCycle,
  persistTradingCycle,
} from "./trading.repository";
import {
  emitFromExecutedTransactions,
  emitFromToolOutcome,
  emitMarketplacePurchaseCompleted,
  emitMarketplacePurchaseStarted,
  emitSubAgentCompleted,
  emitSubAgentStarted,
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
  /** Dev-only override; production uses the user's stored account_mode. */
  accountMode?: AccountMode;
};

/** Clears in-memory cycle state between integration tests. */
export function resetTradingRunnerStateForTests(): void {
  runningUsers.clear();
  lastCycleByUser.clear();
  lastErrorByUser.clear();
  resetDemoCycleMutexForTests();
}

export function resolveAccountModeForCycle(
  storedMode: AccountMode | null,
  override?: AccountMode,
): AccountMode {
  if (!storedMode && !override) {
    throw new TradingError(
      "ACCOUNT_MODE_REQUIRED",
      "Choose demo or live account mode before trading",
      400,
    );
  }

  const effective = storedMode ?? override!;
  if (!override || override === effective) {
    return effective;
  }

  const { nodeEnv } = getServerEnv();
  if (nodeEnv !== "development") {
    throw new TradingError(
      "MODE_OVERRIDE_FORBIDDEN",
      "Account mode override is only allowed in development",
      403,
    );
  }

  return override;
}

export function isUserCycleRunning(userId: string): boolean {
  return runningUsers.has(userId);
}

export function resolveCycleIntervalMs(input: {
  strategyType: "auto" | "custom";
  accountMode?: AccountMode;
  cycleIntervalMinutes: number | null;
  autoCycleIntervalMinutes: number;
  customCycleIntervalMinutes: number;
  demoCycleIntervalSeconds: number;
}): number {
  if (input.accountMode === "demo") {
    if (
      input.strategyType === "custom" &&
      input.cycleIntervalMinutes != null
    ) {
      const minutes = Math.max(1, Math.min(input.cycleIntervalMinutes, 24 * 60));
      return minutes * 60_000;
    }
    const seconds = Math.max(
      1,
      Math.min(input.demoCycleIntervalSeconds, 24 * 60 * 60),
    );
    return seconds * 1000;
  }

  let minutes: number;
  if (input.strategyType === "custom" && input.cycleIntervalMinutes != null) {
    minutes = Math.max(5, Math.min(input.cycleIntervalMinutes, 24 * 60));
  } else {
    minutes =
      input.strategyType === "auto"
        ? input.autoCycleIntervalMinutes
        : input.customCycleIntervalMinutes;
  }
  return minutes * 60_000;
}
const lastCycleByUser = new Map<string, TradingCycleSummary>();
const lastErrorByUser = new Map<string, string>();

function cycleCacheKey(userId: string, accountMode: AccountMode): string {
  return `${userId}:${accountMode}`;
}

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

const virtualPoolPercentByUser = new Map<string, Record<string, number>>();

function initVirtualPoolPercents(
  activePoolIds: readonly string[],
): Record<string, number> {
  const n = activePoolIds.length;
  if (n === 0) {
    return {};
  }
  const equal = 100 / n;
  return Object.fromEntries(activePoolIds.map((id) => [id, equal]));
}

function virtualPoolSetKey(activePoolIds: readonly string[]): string {
  return [...activePoolIds].sort().join(",");
}

function getVirtualPoolPercents(
  userId: string,
  accountMode: AccountMode,
  activePoolIds: readonly string[],
): Record<string, number> {
  const cacheKey = cycleCacheKey(userId, accountMode);
  const poolSetKey = virtualPoolSetKey(activePoolIds);
  const stored = virtualPoolPercentByUser.get(cacheKey);
  if (stored && virtualPoolSetKey(Object.keys(stored)) === poolSetKey) {
    return stored;
  }
  const initial = initVirtualPoolPercents(activePoolIds);
  virtualPoolPercentByUser.set(cacheKey, initial);
  return initial;
}

export function resetVirtualPoolPercents(
  userId: string,
  accountMode: AccountMode,
): void {
  virtualPoolPercentByUser.delete(cycleCacheKey(userId, accountMode));
}

function applyVirtualRebalanceShift(
  userId: string,
  accountMode: AccountMode,
  fromPoolId: string,
  toPoolId: string,
  poolDrift: PoolAllocationDrift[],
): void {
  const overweight = poolDrift.find((entry) => entry.poolId === fromPoolId);
  const underweight = poolDrift.find((entry) => entry.poolId === toPoolId);
  if (!overweight || !underweight) {
    return;
  }
  const shift = Math.min(
    overweight.driftPercent,
    Math.abs(underweight.driftPercent),
  );
  if (shift <= 0) {
    return;
  }
  const stored = virtualPoolPercentByUser.get(cycleCacheKey(userId, accountMode));
  if (!stored) {
    return;
  }
  stored[fromPoolId] = (stored[fromPoolId] ?? 0) - shift;
  stored[toPoolId] = (stored[toPoolId] ?? 0) + shift;
}

function buildPoolDrift(
  poolAllocations: PoolAllocations,
  pools: Awaited<ReturnType<typeof listPoolsWithMetrics>>,
  virtualPercents: Record<string, number>,
): PoolAllocationDrift[] {
  const allocationTotal = Object.values(poolAllocations).reduce((sum, v) => sum + v, 0);

  const activePoolIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);

  return activePoolIds.map((poolId) => {
    const pool = pools.find((p) => p.id === poolId);
    const targetAmount = poolAllocations[poolId as keyof PoolAllocations] ?? 0;
    const targetPercent =
      allocationTotal > 0 ? (targetAmount / allocationTotal) * 100 : 0;

    const currentPercent = virtualPercents[poolId] ?? 0;

    return {
      poolId,
      label: pool?.label ?? poolId,
      targetPercent,
      currentPercent,
      driftPercent: currentPercent - targetPercent,
    };
  });
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
  accountMode: AccountMode;
  walletAddress: Address;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: Awaited<ReturnType<typeof getWalletBalances>>;
  activePoolIds: string[];
  riskLimits: EffectiveRiskLimits;
  allocationMode: ReturnType<typeof resolveAllocationMode>;
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
    allocationMode: input.allocationMode,
    userId: input.userId,
    accountMode: input.accountMode,
    activePoolIds: input.activePoolIds,
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
    rebalancePlanOptions(recommendation, input.pools),
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
  accountMode: AccountMode;
  walletAddress: Address;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: Awaited<ReturnType<typeof getWalletBalances>>;
  activePoolIds: string[];
  riskLimits: EffectiveRiskLimits;
  allocationMode: ReturnType<typeof resolveAllocationMode>;
}): Promise<{
  executedTransactions: ExecutedTransaction[];
  message?: string;
  poolFrom?: string;
  poolTo?: string;
}> {
  return trySmartRebalance(input);
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
    accountMode: "live",
    tradingEnabledAt: null,
    lastCycleAt: null,
    lastCycle: lastCycleByUser.get(userId) ?? null,
    lastError: lastErrorByUser.get(userId) ?? null,
    demoWalletNotice: null,
    demoTradingAvailable: false,
    demoCycleBusy: false,
  };
}

export async function getTradingStatusForUser(
  userId: string,
  modeOverride?: AccountMode,
): Promise<TradingStatusResponse> {
  const user = await findUserById(userId);
  const base = getTradingStatus(userId);
  const accountMode = modeOverride ?? user?.accountMode ?? "live";
  const strategy = await repo.findStrategyByUserId(userId, accountMode);
  const demoAvailability = await getDemoTradingAvailability();

  const dbLastCycle =
    user?.walletAddress != null
      ? await findLatestTradingCycle(
          userId,
          accountMode,
          user.walletAddress,
        )
      : null;
  const cachedLastCycle =
    lastCycleByUser.get(cycleCacheKey(userId, accountMode)) ?? null;
  const lastCycle = dbLastCycle ?? cachedLastCycle ?? null;

  const status: TradingStatusResponse = {
    ...base,
    accountMode,
    lastCycle,
    demoWalletNotice: accountMode === "demo" ? DEMO_WALLET_NOTICE : null,
    demoTradingAvailable: demoAvailability.available,
    demoCycleBusy: isDemoWalletCycleRunning(),
    tradingEnabledAt: strategy?.tradingEnabledAt?.toISOString() ?? null,
    lastCycleAt: lastCycle?.finishedAt ?? strategy?.lastCycleAt?.toISOString() ?? null,
  };

  return status;
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

  try {
    const user = await findUserById(userId);
    if (!user) {
      throw new TradingError("USER_NOT_FOUND", "User not found", 404);
    }

    const accountMode = overrides?.accountMode ?? user.accountMode ?? "live";
    const strategy = await repo.findStrategyByUserId(userId, accountMode);
    if (!strategy) {
      throw new TradingError("STRATEGY_NOT_FOUND", "No agent strategy found", 404);
    }
    if (strategy.status === "paused") {
      throw new TradingError(
        "STRATEGY_PAUSED",
        "Strategy is paused — resume agents to continue trading",
      );
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

    const effectiveAccountMode = resolveAccountModeForCycle(
      user.accountMode,
      overrides?.accountMode,
    );
    const trading = resolveTradingWallet(user, effectiveAccountMode);
    try {
      await assertTradingRpcHealthy(trading.rpcMode);
    } catch (err) {
      if (err instanceof TradingDemoDisabledError) {
        throw new TradingError("DEMO_DISABLED", err.message, 503);
      }
      if (err instanceof AnvilForkUnhealthyError) {
        throw new TradingError("ANVIL_UNHEALTHY", err.message, 503);
      }
      throw err;
    }

    if (trading.rpcMode === "fork") {
      await acquireDemoCycleLock(userId);
    }

    emitTradingCycleStarted(userId, {
      cycleId,
      accountMode: trading.accountMode,
      reason,
      startedAt,
    });

    const poolAllocations = poolAllocationsFromRows(strategy.poolAllocations);
    let activePoolIds = new Set(
      Object.entries(poolAllocations)
        .filter(([, amount]) => amount > 0)
        .map(([id]) => id),
    );
    const allocationMode = resolveAllocationMode(trading.accountMode);

    return await withTradingRpc(trading.rpcMode, async () =>
      withDemoAgentSigning(trading.rpcMode, trading.walletAddress, async () => {
    const tradingWalletAddress = trading.walletAddress;
    const isDemoCycle = trading.rpcMode === "fork";

    if (isDemoCycle) {
      const demoEnv = getDemoEnv();
      await ensureDemoTradingWalletFunded({
        anvilRpc: demoEnv.anvilRpcUrl,
        agentAddress: tradingWalletAddress,
        depositAmount: strategy.depositAmount,
        whaleAddress: demoEnv.forkWhale,
        poolIds: [...activePoolIds],
      });
    }

    const [pools, balances] = await Promise.all([
      fetchPools(),
      fetchBalances(tradingWalletAddress, [...activePoolIds]),
    ]);

    const knownPoolIds = new Set(pools.map((pool) => pool.id));
    for (const poolId of [...activePoolIds]) {
      if (!knownPoolIds.has(poolId)) {
        activePoolIds.delete(poolId);
        log.warn("Ignoring non-pool id in strategy allocations", {
          userId,
          poolId,
        });
      }
    }

    const virtualPercents = getVirtualPoolPercents(
      userId,
      trading.accountMode,
      [...activePoolIds],
    );
    let poolDrift = buildPoolDrift(poolAllocations, pools, virtualPercents);

    const hasBalance = balances.balances.some((b) => parseBalanceAmount(b.formatted) > 0);
    const finishedAt = new Date().toISOString();

    let executedTransactions: ExecutedTransaction[] = [];
    let toolActions: TradingToolAction[] = [];
    let llmResponse: string | null = null;
    let llmPending = true;
    let llmProvider: TradingCycleSummary["llmProvider"];
    let somniaAttestation: TradingCycleSummary["somniaAttestation"];
    let subAgentOutputs: TradingCycleSummary["subAgentOutputs"];
    let executionMessage: string | undefined;

    const subAgents = resolveSubAgents(
      strategy.strategyType,
      strategy.subAgentConfig,
    );
    const riskLimits = resolveRiskLimits(subAgents);

    if (
      !overrides?.skipCycleCooldown &&
      !(trading.accountMode === "demo" && reason === "scheduled")
    ) {
      assertCycleCooldown(strategy.lastCycleAt, riskLimits, reason);
    }
    if (hasBalance) {
      assertPortfolioFunded(balances, riskLimits);
    }

    if (hasBalance) {
      try {
        const llm = await invokeLlm({
          userId,
          cycleId,
          accountMode: trading.accountMode,
          allocationMode,
          walletAddress: tradingWalletAddress,
          strategyType: strategy.strategyType,
          depositAmount: strategy.depositAmount,
          lastCycleAt: strategy.lastCycleAt,
          poolAllocations,
          poolDrift,
          pools,
          balances,
          subAgents,
          subAgentX402BudgetSttWei: strategy.subAgentX402BudgetSttWei,
          activePoolIds: [...activePoolIds],
          riskLimits,
          dryRunTrades: overrides?.simulation?.dryRunTrades,
          skipSomniaAttestation:
            isDemoCycle || overrides?.simulation?.skipSomniaAttestation,
          onMarketplacePurchaseStarted: (payload) => {
            emitMarketplacePurchaseStarted(userId, payload);
          },
          onMarketplacePurchaseCompleted: (payload) => {
            emitMarketplacePurchaseCompleted(userId, payload);
          },
          onSubAgentStarted: (agentId: string, agentName: string) => {
            emitSubAgentStarted(userId, {
              cycleId,
              accountMode: trading.accountMode,
              agentId,
              agentName,
              at: new Date().toISOString(),
            });
          },
          onSubAgentCompleted: (output: { agentId: string; agentName: string; summary: string; durationMs: number }) => {
            emitSubAgentCompleted(userId, {
              cycleId,
              accountMode: trading.accountMode,
              agentId: output.agentId,
              agentName: output.agentName,
              summary: output.summary,
              durationMs: output.durationMs,
              at: new Date().toISOString(),
            });
          },
          onToolExecuted: (outcome) => {
            emitFromToolOutcome(userId, cycleId, trading.accountMode, outcome);
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
        if (
          llm.marketplacePreflight &&
          !llm.marketplacePreflight.ok
        ) {
          executionMessage = executionMessage
            ? `${executionMessage} ${llm.marketplacePreflight.message}`
            : llm.marketplacePreflight.message;
        }
        subAgentOutputs = llm.subAgentOutputs?.map((o) => ({
          agentId: o.agentId,
          agentName: o.agentName,
          summary: o.summary,
          data: o.data,
          durationMs: o.durationMs,
          marketplaceProductId: o.marketplaceProductId,
          marketplacePurchase: o.marketplacePurchase
            ? {
                productId: o.marketplaceProductId ?? "",
                amountSttWei: o.marketplacePurchase.amountSttWei,
                txHash: o.marketplacePurchase.txHash,
                devBypass: o.marketplacePurchase.devBypass,
                status: o.marketplacePurchase.status,
                error: o.marketplacePurchase.error,
                productData: o.marketplacePurchase.productData,
              }
            : undefined,
        }));

        if (executedTransactions.length === 0) {
          try {
            const smart = await trySmartRebalance({
              userId,
              accountMode: trading.accountMode,
              walletAddress: tradingWalletAddress,
              poolDrift,
              pools,
              balances,
              activePoolIds: [...activePoolIds],
              riskLimits,
              allocationMode,
            });
            if (smart.executedTransactions.length > 0) {
              executedTransactions = smart.executedTransactions;
              emitFromExecutedTransactions(
                userId,
                cycleId,
                trading.accountMode,
                smart.executedTransactions,
                {
                  poolFrom: smart.poolFrom ?? null,
                  poolTo: smart.poolTo ?? null,
                },
              );
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
            accountMode: trading.accountMode,
            walletAddress: tradingWalletAddress,
            poolDrift,
            pools,
            balances,
            activePoolIds: [...activePoolIds],
            riskLimits,
            allocationMode,
          });
          executedTransactions = rebalance.executedTransactions;
          if (rebalance.executedTransactions.length > 0) {
            emitFromExecutedTransactions(
              userId,
              cycleId,
              trading.accountMode,
              rebalance.executedTransactions,
              {
                poolFrom: rebalance.poolFrom ?? null,
                poolTo: rebalance.poolTo ?? null,
              },
            );
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

    if (executedTransactions.length > 0 && allocationMode === "strict") {
      const rec = buildTradingRecommendation({
        poolDrift,
        pools,
        balances,
        riskLimits,
        allocationMode,
        userId,
        accountMode: trading.accountMode,
        activePoolIds: [...activePoolIds],
      });
      if (rec.fromPoolId && rec.toPoolId) {
        applyVirtualRebalanceShift(
          userId,
          trading.accountMode,
          rec.fromPoolId,
          rec.toPoolId,
          poolDrift,
        );
        poolDrift = buildPoolDrift(
          poolAllocations,
          pools,
          getVirtualPoolPercents(userId, trading.accountMode, [...activePoolIds]),
        );
      }
    }

    const defaultMessage = hasBalance
      ? "Portfolio analyzed. OpenAI drives trading; Somnia on-chain agent attests integration."
      : "No on-chain balance detected yet — deposit to the agent wallet, then run another cycle.";

    const summary: TradingCycleSummary = {
      cycleId,
      userId,
      strategyId: strategy.id,
      accountMode: trading.accountMode,
      reason,
      startedAt,
      finishedAt,
      phase: "completed",
      walletAddress: tradingWalletAddress,
      depositAmount: strategy.depositAmount,
      poolDrift,
      executedTransactions,
      llmPending,
      llmResponse,
      llmProvider,
      somniaAttestation,
      toolActions: toolActions.length > 0 ? toolActions : undefined,
      subAgentOutputs: subAgentOutputs && subAgentOutputs.length > 0 ? subAgentOutputs : undefined,
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

    schedulePortfolioSnapshot({
      userId,
      accountMode: trading.accountMode,
      walletAddress: tradingWalletAddress,
      poolIds: [...activePoolIds],
      rpcMode: resolveTradingRpc(trading.accountMode),
    });

    lastCycleByUser.set(cycleCacheKey(userId, summary.accountMode), summary);

    emitTradingCycleCompleted(userId, {
      cycleId,
      accountMode: summary.accountMode,
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
      }),
    );
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
      accountMode: "live",
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
      const user = await findUserById(userId);
      if (user?.accountMode) {
        const strategy = await repo.findStrategyByUserId(
          userId,
          user.accountMode,
        );
        if (strategy) {
          failedSummary.strategyId = strategy.id;
          failedSummary.depositAmount = strategy.depositAmount;
          const failedTrading = resolveTradingWallet(user);
          failedSummary.accountMode = failedTrading.accountMode;
          failedSummary.walletAddress = failedTrading.walletAddress;
          await persistTradingCycle(failedSummary);
        }
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
      accountMode: failedSummary.accountMode,
      reason,
      status: "failed",
      message,
      executedCount: 0,
      finishedAt: new Date().toISOString(),
    });

    log.error("Trading cycle failed", { userId, cycleId, reason, message });
    throw err;
  } finally {
    releaseDemoCycleLock(userId);
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
