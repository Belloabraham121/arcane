import { apiRequest } from "./client"

export type DemoDepositSymbol = "USDCe" | "WSOMI" | "WETH" | "SOMI"

export type DemoDepositResult = {
  walletAddress: string
  symbol: string
  credited: string
  formattedBalance: string
  chainLabel: string
}

export async function depositDemoTokens(symbol: DemoDepositSymbol, amount: string) {
  return apiRequest<DemoDepositResult>("/api/v1/demo/deposit", {
    method: "POST",
    body: JSON.stringify({ symbol, amount }),
  })
}
