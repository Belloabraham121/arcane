import type { TradingCycleCompletedEvent } from "@/lib/api/trading-socket-types"
import type { TradingCycleSummary } from "@/lib/api/trading"

export type AgentCycleOutcome = {
  cycleId: string
  status: "running" | "completed" | "failed"
  executedCount: number
  message: string
  llmResponse: string | null
  finishedAt: string | null
  reason: string | null
}

export function outcomeFromCycleSummary(
  cycle: TradingCycleSummary,
): AgentCycleOutcome {
  return {
    cycleId: cycle.cycleId,
    status: cycle.phase === "failed" ? "failed" : "completed",
    executedCount: cycle.executedTransactions?.length ?? 0,
    message: cycle.message,
    llmResponse: cycle.llmResponse ?? null,
    finishedAt: cycle.finishedAt,
    reason: cycle.reason,
  }
}

export function outcomeFromSocketCompleted(
  event: TradingCycleCompletedEvent,
): AgentCycleOutcome {
  return {
    cycleId: event.cycleId,
    status: event.status,
    executedCount: event.executedCount,
    message: event.message,
    llmResponse: event.llmResponse ?? null,
    finishedAt: event.finishedAt,
    reason: event.reason,
  }
}

export function runningOutcome(cycleId: string, reason?: string): AgentCycleOutcome {
  return {
    cycleId,
    status: "running",
    executedCount: 0,
    message: "Agent is analyzing pools and portfolio…",
    llmResponse: null,
    finishedAt: null,
    reason: reason ?? null,
  }
}

export function executionHeadline(outcome: AgentCycleOutcome, isDemo: boolean): string {
  if (outcome.status === "running") {
    return isDemo ? "Demo cycle in progress" : "Live cycle in progress"
  }
  if (outcome.status === "failed") {
    return "Cycle failed"
  }
  if (outcome.executedCount > 0) {
    return `${outcome.executedCount} swap${outcome.executedCount === 1 ? "" : "s"} executed`
  }
  return "Cycle completed — no swaps"
}

export function executionDetail(outcome: AgentCycleOutcome): string {
  if (outcome.status === "running") {
    return outcome.message
  }
  if (outcome.executedCount > 0) {
    return `On-chain trades ran${outcome.reason ? ` (${outcome.reason})` : ""}. Check Demo Trades for tx hashes.`
  }
  const snippet = outcome.llmResponse?.trim() || outcome.message
  const firstLine = snippet.split("\n").find((line) => line.trim().length > 0)?.trim()
  return firstLine ?? "Agent analyzed pools but did not execute a swap this cycle."
}
