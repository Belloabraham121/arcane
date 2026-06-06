export type TradingCyclePhase = "idle" | "analyzing" | "completed" | "failed";

export type PoolAllocationDrift = {
  poolId: string;
  label: string;
  targetPercent: number;
  /** Estimated current share of wallet value (balance-weighted; USD estimate pending). */
  currentPercent: number;
  driftPercent: number;
};

export type TradingCycleSummary = {
  cycleId: string;
  userId: string;
  strategyId: string;
  reason: "activation" | "manual" | "scheduled";
  startedAt: string;
  finishedAt: string;
  phase: TradingCyclePhase;
  message: string;
  walletAddress: string;
  depositAmount: number;
  poolDrift: PoolAllocationDrift[];
  /** Reserved for Phase 4 LLM tool execution. */
  llmPending: boolean;
};

export type TradingStatusResponse = {
  phase: TradingCyclePhase;
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  lastCycle: TradingCycleSummary | null;
  lastError: string | null;
};
