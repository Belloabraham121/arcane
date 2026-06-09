import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"

/** Legacy strategy slugs → token symbols (order-independent). */
const LEGACY_POOL_PAIRS: Record<string, readonly [string, string]> = {
  "usdce-wsomi": ["USDCe", "WSOMI"],
  "usdce-weth": ["USDCe", "WETH"],
  "wsomi-weth": ["WSOMI", "WETH"],
}

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\./g, "")
}

function symbolsMatch(pool: QuickSwapPool, tokenA: string, tokenB: string): boolean {
  const a = normalizeSymbol(tokenA)
  const b = normalizeSymbol(tokenB)
  const t0 = normalizeSymbol(pool.token0.symbol)
  const t1 = normalizeSymbol(pool.token1.symbol)
  return (t0 === a && t1 === b) || (t0 === b && t1 === a)
}

function tvlUsd(pool: QuickSwapPool): number {
  const n = Number(pool.metrics.totalValueLockedUsd ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Resolve pool by address id, legacy slug, or best TVL match for token pair. */
export function resolvePoolById(
  poolId: string,
  pools: readonly QuickSwapPool[],
): QuickSwapPool | undefined {
  const lower = poolId.toLowerCase()
  const direct = pools.find((pool) => pool.id.toLowerCase() === lower)
  if (direct) {
    return direct
  }

  const legacyPair = LEGACY_POOL_PAIRS[poolId]
  if (!legacyPair) {
    return undefined
  }

  const matches = pools.filter((pool) =>
    symbolsMatch(pool, legacyPair[0], legacyPair[1]),
  )
  if (matches.length === 0) {
    return undefined
  }

  return matches.reduce((best, pool) => (tvlUsd(pool) > tvlUsd(best) ? pool : best))
}

export function buildPoolLookup(pools: readonly QuickSwapPool[]) {
  return {
    resolve(poolId: string) {
      return resolvePoolById(poolId, pools)
    },
  }
}

/** Active allocations that map to a live QuickSwap pool from the API. */
export function activeResolvablePoolEntries(
  poolAllocations: PoolAllocations,
  pools: readonly QuickSwapPool[],
): Array<[string, number]> {
  return Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .filter(([poolId]) => resolvePoolById(poolId, pools) != null)
}
