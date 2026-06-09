import type { AccountMode } from "./auth"
import { API_URL, apiRequest } from "./client"

export type TradingCyclePhase = "idle" | "analyzing" | "completed" | "failed"

export type PoolAllocationDrift = {
  poolId: string
  label: string
  targetPercent: number
  currentPercent: number
  driftPercent: number
}

export type ExecutedTransaction = {
  kind: "approve" | "swap"
  hash: string
  status: "success" | "reverted"
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  amountOut?: string
}

export type TradingToolAction = {
  tool: string
  success: boolean
  result: string
}

export type SomniaAttestationSummary = {
  status: "submitted" | "success" | "failed" | "skipped"
  requestId: string | null
  txHash: string | null
  onChainResponse: string | null
  message: string
}

export type TradingCycleSummary = {
  cycleId: string
  accountMode?: AccountMode
  reason: "activation" | "manual" | "scheduled" | "deposit"
  startedAt: string
  finishedAt: string
  phase: TradingCyclePhase
  message: string
  depositAmount: number
  poolDrift: PoolAllocationDrift[]
  executedTransactions: ExecutedTransaction[]
  llmPending: boolean
  llmResponse?: string | null
  llmProvider?: "openai"
  somniaAttestation?: SomniaAttestationSummary
  toolActions?: TradingToolAction[]
}

export type TradingStatus = {
  phase: TradingCyclePhase
  accountMode: "demo" | "live"
  tradingEnabledAt: string | null
  lastCycleAt: string | null
  lastCycle: TradingCycleSummary | null
  lastError: string | null
  demoWalletNotice: string | null
  demoTradingAvailable: boolean
  demoCycleBusy: boolean
}

export async function fetchTradingStatus(mode?: AccountMode) {
  const query = mode ? `?mode=${mode}` : ""
  return apiRequest<{ status: TradingStatus }>(
    `/api/v1/agents/trading/status${query}`,
  )
}

export async function runTradingCycle() {
  return apiRequest<{ cycle: TradingCycleSummary }>(
    "/api/v1/agents/trading/run-cycle",
    { method: "POST" },
  )
}

export type TradingHistoryListItem = {
  id: string
  accountMode: AccountMode
  reason: string
  status: string
  message: string
  llmPending: boolean
  llmResponse: string | null
  llmProvider: string | null
  somniaAttestation: SomniaAttestationSummary | null
  startedAt: string
  finishedAt: string
  actionCount: number
}

export type TradingActionRecord = {
  id: string
  type: string
  toolName: string | null
  tokenIn: string | null
  tokenOut: string | null
  amountIn: string | null
  amountOut: string | null
  poolFrom: string | null
  poolTo: string | null
  txHash: string | null
  status: string
  metadata: unknown
  createdAt: string
}

export type TradingHistoryDetail = TradingHistoryListItem & {
  poolDrift: PoolAllocationDrift[]
  llmSummary: string | null
  actions: TradingActionRecord[]
}

export type TradingHistoryPagination = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type HistoryEnvelope = {
  success: boolean
  data: { items: TradingHistoryListItem[] } | null
  meta: {
    correlation_id?: string
    timestamp?: string
    pagination?: TradingHistoryPagination
  }
  error: { code: string; message: string } | null
}

export async function fetchTradingHistory(
  page = 1,
  limit = 20,
  mode?: AccountMode,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (mode) {
    params.set("mode", mode)
  }

  try {
    const res = await fetch(
      `${API_URL}/api/v1/agents/trading/history?${params}`,
      {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      },
    )
    const body = (await res.json()) as HistoryEnvelope
    return {
      success: body.success,
      data: body.data,
      meta: body.meta,
      error: body.error,
    }
  } catch {
    return {
      success: false,
      data: null,
      meta: {},
      error: {
        code: "NETWORK_ERROR",
        message: `Cannot reach API at ${API_URL}`,
      },
    }
  }
}

export async function fetchTradingCycleDetail(cycleId: string) {
  return apiRequest<{ cycle: TradingHistoryDetail }>(
    `/api/v1/agents/trading/history/${cycleId}`,
  )
}
