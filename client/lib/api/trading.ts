import { apiRequest } from "./client"

export type TradingCyclePhase = "idle" | "analyzing" | "completed" | "failed"

export type PoolAllocationDrift = {
  poolId: string
  label: string
  targetPercent: number
  currentPercent: number
  driftPercent: number
}

export type TradingCycleSummary = {
  cycleId: string
  reason: "activation" | "manual" | "scheduled"
  startedAt: string
  finishedAt: string
  phase: TradingCyclePhase
  message: string
  depositAmount: number
  poolDrift: PoolAllocationDrift[]
  llmPending: boolean
}

export type TradingStatus = {
  phase: TradingCyclePhase
  tradingEnabledAt: string | null
  lastCycleAt: string | null
  lastCycle: TradingCycleSummary | null
  lastError: string | null
}

export async function fetchTradingStatus() {
  return apiRequest<{ status: TradingStatus }>("/api/v1/agents/trading/status")
}

export async function runTradingCycle() {
  return apiRequest<{ cycle: TradingCycleSummary }>(
    "/api/v1/agents/trading/run-cycle",
    { method: "POST" },
  )
}
