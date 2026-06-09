"use client"

import { PoolStatsBadges } from "@/components/pool-stats-badges"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import type { AccountMode } from "@/lib/api/auth"
import type { PoolAllocations } from "@/lib/api/strategy-types"
import { poolDisplayStats } from "@/lib/pool-display"
import { POOL_MARKET_COLORS } from "@/lib/pool-allocations"
import { activeResolvablePoolEntries, resolvePoolById } from "@/lib/pool-resolve"

type PoolMetricsStripProps = {
  poolAllocations: PoolAllocations
  pools: QuickSwapPool[]
  loading?: boolean
  accountMode?: AccountMode
}

export function PoolMetricsStrip({
  poolAllocations,
  pools,
  loading = false,
  accountMode,
}: PoolMetricsStripProps) {
  const isDemo = accountMode === "demo"
  const activeEntries = activeResolvablePoolEntries(poolAllocations, pools)

  if (activeEntries.length === 0) {
    return null
  }

  return (
    <div className="border border-border">
      <p className="border-b border-border px-4 py-3 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        {isDemo ? "Pool metrics (fork reference)" : "Live pool metrics"}
      </p>
      <div className="flex gap-px overflow-x-auto bg-border">
        {activeEntries.map(([poolId]) => {
          const pool = resolvePoolById(poolId, pools)
          const stats = pool ? poolDisplayStats(pool) : null

          return (
            <div
              key={poolId}
              className="min-w-[220px] flex-1 bg-background px-4 py-4"
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${POOL_MARKET_COLORS[poolId] ?? "bg-muted-foreground"}`}
                />
                <span className="font-mono text-xs text-foreground">
                  {pool?.label ?? poolId}
                </span>
              </div>
              {stats && (
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {stats.pair}
                </p>
              )}
              {loading && !stats ? (
                <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
              ) : stats ? (
                <>
                  <PoolStatsBadges
                    tvlUsd={stats.tvlUsd}
                    volumeUsd={stats.volumeUsd}
                    liquidity={stats.liquidity}
                    apy={stats.apy}
                    layout="stacked"
                  />
                  {stats.priceHint && (
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      {stats.priceHint}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
