export type TradingCyclePhase = "idle" | "analyzing" | "completed" | "failed";

export type PoolAllocationDrift = {
  poolId: string;
  label: string;
  targetPercent: number;
  /** Estimated current share of wallet value (balance-weighted; USD estimate pending). */
  currentPercent: number;
  driftPercent: number;
};

export type ExecutedTransaction = {
  kind: "approve" | "swap";
  hash: string;
  status: "success" | "reverted";
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOut?: string;
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
  /** On-chain txs signed by the agent wallet (no user approval). */
  executedTransactions: ExecutedTransaction[];
  /** True when LLM-driven tool execution is not wired yet. */
  llmPending: boolean;
};

export type TradingStatusResponse = {
  phase: TradingCyclePhase;
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  lastCycle: TradingCycleSummary | null;
  lastError: string | null;
};
