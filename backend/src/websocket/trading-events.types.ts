import type { AccountMode } from "@prisma/client";

export const TRADING_SOCKET_EVENTS = {
  cycleStarted: "trading:cycle_started",
  actionExecuted: "trading:action_executed",
  subAgentStarted: "trading:sub_agent_started",
  subAgentCompleted: "trading:sub_agent_completed",
  cycleCompleted: "trading:cycle_completed",
} as const;

export type TradingCycleStartedEvent = {
  cycleId: string;
  accountMode: AccountMode;
  reason: string;
  startedAt: string;
};

export type TradingActionExecutedEvent = {
  cycleId: string;
  accountMode: AccountMode;
  type: string;
  toolName?: string | null;
  poolFrom?: string | null;
  poolTo?: string | null;
  tokenIn?: string | null;
  tokenOut?: string | null;
  amountIn?: string | null;
  amountOut?: string | null;
  txHash?: string | null;
  status: string;
  at: string;
};

export type SomniaAttestationEvent = {
  status: "submitted" | "success" | "failed" | "skipped";
  requestId: string | null;
  txHash: string | null;
  message: string;
};

export type SubAgentStartedEvent = {
  cycleId: string;
  accountMode: AccountMode;
  agentId: string;
  agentName: string;
  at: string;
};

export type SubAgentCompletedEvent = {
  cycleId: string;
  accountMode: AccountMode;
  agentId: string;
  agentName: string;
  summary: string;
  durationMs: number;
  at: string;
};

export type TradingCycleCompletedEvent = {
  cycleId: string;
  accountMode: AccountMode;
  reason: string;
  status: "completed" | "failed";
  message: string;
  llmResponse?: string | null;
  llmProvider?: "openai";
  somniaAttestation?: SomniaAttestationEvent;
  executedCount: number;
  finishedAt: string;
};
