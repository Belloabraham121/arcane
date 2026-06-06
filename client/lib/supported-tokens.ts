import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"

export type SupportedToken = {
  symbol: string
  name: string
  address: `0x${string}`
  decimals: number
}

export function tokensFromAllocatedPools(
  pools: QuickSwapPool[],
  allocations: PoolAllocations,
): SupportedToken[] {
  const activePoolIds = new Set(
    Object.entries(allocations)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id),
  )

  const seen = new Set<string>()
  const tokens: SupportedToken[] = []

  for (const pool of pools) {
    if (activePoolIds.size > 0 && !activePoolIds.has(pool.id)) {
      continue
    }

    for (const token of [pool.token0, pool.token1]) {
      const key = token.address.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      tokens.push(token)
    }
  }

  return tokens.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export function allocatedPoolIds(allocations: PoolAllocations): string[] {
  return Object.entries(allocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id)
}
