import { apiRequest } from "./client"

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
}

export async function fetchWalletBalances(poolIds?: string[]) {
  const query =
    poolIds && poolIds.length > 0
      ? `?poolIds=${encodeURIComponent(poolIds.join(","))}`
      : ""

  return apiRequest<WalletBalancesResponse>(`/api/v1/wallets/balances${query}`)
}
