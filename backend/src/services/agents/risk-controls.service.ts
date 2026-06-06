import type { Address } from "viem";
import { getQuickSwapEnv, getTradingExecutionEnv } from "../../config/env";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import type { EffectiveRiskLimits } from "./risk-controls.types";
import type {
  SubAgentConfigItem,
  SubAgentRiskLimits,
} from "./strategy.types";

export class RiskControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RiskControlError";
  }
}

const RISK_MANAGER_ID = "risk-manager";

function clampBps(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(Math.round(value), 10_000));
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(value, 100));
}

function minPositive(a: number, b: number): number {
  return Math.min(a, b);
}

function riskLimitsFromSubAgent(
  subAgents: SubAgentConfigItem[],
): SubAgentRiskLimits | null {
  const riskManager = subAgents.find(
    (agent) => agent.id === RISK_MANAGER_ID && agent.enabled,
  );

  if (!riskManager?.limits || typeof riskManager.limits !== "object") {
    return riskManager?.enabled ? {} : null;
  }

  return riskManager.limits;
}

/**
 * Merges env defaults with the strictest risk-manager sub-agent limits when enabled.
 */
export function resolveRiskLimits(
  subAgents: SubAgentConfigItem[],
): EffectiveRiskLimits {
  const env = getTradingExecutionEnv();
  const quickswap = getQuickSwapEnv();
  const agentLimits = riskLimitsFromSubAgent(subAgents);
  const riskManagerActive = subAgents.some(
    (agent) => agent.id === RISK_MANAGER_ID && agent.enabled,
  );

  let maxSwapPortfolioBps = env.maxSwapPortfolioBps;
  let maxSlippageBps = quickswap.maxSlippageBps;
  let driftThresholdPercent = env.driftThresholdPercent;
  let cycleCooldownMs = env.cycleCooldownMinutes * 60_000;

  if (agentLimits) {
    if (agentLimits.maxSwapPortfolioPercent != null) {
      maxSwapPortfolioBps = minPositive(
        maxSwapPortfolioBps,
        clampBps(agentLimits.maxSwapPortfolioPercent * 100, maxSwapPortfolioBps),
      );
    }
    if (agentLimits.maxSlippageBps != null) {
      maxSlippageBps = minPositive(
        maxSlippageBps,
        clampBps(agentLimits.maxSlippageBps, maxSlippageBps),
      );
    }
    if (agentLimits.driftThresholdPercent != null) {
      driftThresholdPercent = Math.max(
        driftThresholdPercent,
        clampPercent(agentLimits.driftThresholdPercent, driftThresholdPercent),
      );
    }
    if (agentLimits.cycleCooldownMinutes != null) {
      cycleCooldownMs = Math.max(
        cycleCooldownMs,
        agentLimits.cycleCooldownMinutes * 60_000,
      );
    }
  }

  return {
    maxSwapPortfolioBps: clampBps(maxSwapPortfolioBps, 2000),
    maxSlippageBps: clampBps(maxSlippageBps, quickswap.maxSlippageBps),
    driftThresholdPercent: clampPercent(driftThresholdPercent, 5),
    cycleCooldownMs,
    minSwapAmountRaw: env.minSwapAmountRaw,
    minPortfolioBalanceRaw: env.minPortfolioBalanceRaw,
    riskManagerActive,
  };
}

export function resolveSlippageBps(
  requestedBps: number | undefined,
  limits: EffectiveRiskLimits,
): number {
  const { defaultSlippageBps } = getQuickSwapEnv();
  const slippageBps = requestedBps ?? defaultSlippageBps;
  if (slippageBps > limits.maxSlippageBps) {
    throw new RiskControlError(
      "SLIPPAGE_CAP_EXCEEDED",
      `Slippage ${slippageBps} bps exceeds cap ${limits.maxSlippageBps}`,
    );
  }
  return slippageBps;
}

export function capSwapAmountByPolicy(
  amountIn: bigint,
  balanceRaw: bigint,
  limits: EffectiveRiskLimits,
): bigint {
  if (balanceRaw <= 0n) {
    return 0n;
  }
  const maxByPolicy =
    (balanceRaw * BigInt(limits.maxSwapPortfolioBps)) / 10_000n;
  const capped = amountIn > maxByPolicy ? maxByPolicy : amountIn;
  if (capped < limits.minSwapAmountRaw) {
    return 0n;
  }
  return capped;
}

export function assertPoolInAllocations(
  poolId: string,
  activePoolIds: readonly string[],
): void {
  if (!activePoolIds.includes(poolId)) {
    throw new RiskControlError(
      "POOL_NOT_ALLOWED",
      `Pool ${poolId} is not in the user's selected allocations`,
    );
  }
}

export function assertTokenInAllowedPools(
  token: Address,
  allowedAddresses: readonly Address[],
): void {
  const ok = allowedAddresses.some(
    (entry) => entry.toLowerCase() === token.toLowerCase(),
  );
  if (!ok) {
    throw new RiskControlError(
      "TOKEN_NOT_ALLOWED",
      `Token ${token} is not in the user's selected pools`,
    );
  }
}

export function totalPortfolioBalanceRaw(
  balances: WalletBalancesResult,
): bigint {
  return balances.balances.reduce((sum, row) => {
    try {
      return sum + BigInt(row.balance || "0");
    } catch {
      return sum;
    }
  }, 0n);
}

export function assertPortfolioFunded(
  balances: WalletBalancesResult,
  limits: EffectiveRiskLimits,
): void {
  const total = totalPortfolioBalanceRaw(balances);
  if (total < limits.minPortfolioBalanceRaw) {
    throw new RiskControlError(
      "PAUSED_LOW_BALANCE",
      "Agent wallet balance is below the minimum required to trade",
      403,
    );
  }
}

export type CycleCooldownReason =
  | "activation"
  | "manual"
  | "scheduled"
  | "deposit";

const COOLDOWN_BYPASS: ReadonlySet<CycleCooldownReason> = new Set([
  "activation",
  "deposit",
]);

export function isCycleCooldownActive(
  lastCycleAt: Date | null | undefined,
  limits: EffectiveRiskLimits,
): boolean {
  if (!lastCycleAt) {
    return false;
  }
  const elapsed = Date.now() - lastCycleAt.getTime();
  return elapsed < limits.cycleCooldownMs;
}

export function assertCycleCooldown(
  lastCycleAt: Date | null | undefined,
  limits: EffectiveRiskLimits,
  reason: CycleCooldownReason,
): void {
  if (COOLDOWN_BYPASS.has(reason)) {
    return;
  }
  if (!isCycleCooldownActive(lastCycleAt, limits)) {
    return;
  }
  const remainingSec = Math.ceil(
    (limits.cycleCooldownMs - (Date.now() - lastCycleAt!.getTime())) / 1000,
  );
  throw new RiskControlError(
    "CYCLE_COOLDOWN",
    `Trading cooldown active — retry in ${remainingSec}s`,
    429,
  );
}
