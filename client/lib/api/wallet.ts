import { apiRequest } from "./client"
import type { AccountMode } from "./auth"

export type WalletTokenBalance = {
  symbol: string
  name: string
  address: `0x${string}` | null
  decimals: number
  balance: string
  formatted: string
}

export type WalletBalancesResponse = {
  chainId: number
  walletAddress: `0x${string}`
  balances: WalletTokenBalance[]
  accountMode?: AccountMode
  chainLabel?: string
}

export async function fetchWalletBalances(
  poolIds?: string[],
  mode?: AccountMode,
) {
  const params = new URLSearchParams()
  if (poolIds && poolIds.length > 0) {
    params.set("poolIds", poolIds.join(","))
  }
  if (mode) {
    params.set("mode", mode)
  }
  const query = params.toString() ? `?${params.toString()}` : ""

  return apiRequest<WalletBalancesResponse>(`/api/v1/wallets/balances${query}`)
}
