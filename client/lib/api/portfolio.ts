import { apiRequest } from "./client"
import type { AccountMode } from "./auth"

export type PortfolioSummary = {
  currentValueUsd: number
  baselineUsd: number
  manualDepositUsd: number
  detectedDepositUsd: number | null
  netEarnedUsd: number
  aprSinceActivation: number | null
  apr24h: number | null
  walletAddress: string
  accountMode: AccountMode
  chainLabel: string
  unpricedSymbols: string[]
}

export async function fetchPortfolioSummary(mode?: AccountMode) {
  const query = mode ? `?mode=${mode}` : ""
  return apiRequest<PortfolioSummary>(`/api/v1/portfolio/summary${query}`)
}
