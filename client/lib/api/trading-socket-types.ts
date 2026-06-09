import type { AccountMode } from "@/lib/api/auth"

export const TRADING_SOCKET_EVENTS = {
  cycleStarted: "trading:cycle_started",
  actionExecuted: "trading:action_executed",
  cycleCompleted: "trading:cycle_completed",
} as const

export type TradingCycleStartedEvent = {
  cycleId: string
  accountMode: AccountMode
  reason: string
  startedAt: string
}

export type TradingActionExecutedEvent = {
  cycleId: string
  accountMode: AccountMode
  type: string
  toolName?: string | null
  poolFrom?: string | null
  poolTo?: string | null
  tokenIn?: string | null
  tokenOut?: string | null
  amountIn?: string | null
  amountOut?: string | null
  txHash?: string | null
  status: string
  at: string
}

export type TradingCycleCompletedEvent = {
  cycleId: string
  accountMode: AccountMode
  reason: string
  status: "completed" | "failed"
  message: string
  llmResponse?: string | null
  executedCount: number
  finishedAt: string
}

export type LiveTradingFeedItem = {
  id: string
  at: string
  headline: string
  detail: string
  txHash?: string | null
  poolFrom?: string | null
  poolTo?: string | null
  status: string
  cycleId?: string
  llmResponse?: string | null
}
