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

export type TradingToolAction = {
  tool: string;
  success: boolean;
  result: string;
};

export type SomniaAttestationSummary = {
  status: "submitted" | "success" | "failed" | "skipped";
  requestId: string | null;
  txHash: string | null;
  onChainResponse: string | null;
  message: string;
};

export type TradingCycleSummary = {
  cycleId: string;
  userId: string;
  strategyId: string;
  accountMode: "demo" | "live";
  reason: "activation" | "manual" | "scheduled" | "deposit";
  startedAt: string;
  finishedAt: string;
  phase: TradingCyclePhase;
  message: string;
  walletAddress: string;
  depositAmount: number;
  poolDrift: PoolAllocationDrift[];
  /** On-chain txs signed by the agent wallet (no user approval). */
  executedTransactions: ExecutedTransaction[];
  /** False after OpenAI trading analysis runs in this cycle. */
  llmPending: boolean;
  llmResponse?: string | null;
  /** OpenAI powers decisions; Somnia on-chain call is attestation-only. */
  llmProvider?: "openai";
  somniaAttestation?: SomniaAttestationSummary;
  toolActions?: TradingToolAction[];
};

export type TradingStatusResponse = {
  phase: TradingCyclePhase;
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  lastCycle: TradingCycleSummary | null;
  lastError: string | null;
};
