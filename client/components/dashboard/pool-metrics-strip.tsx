"use client"

import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"
import { POOL_MARKET_COLORS } from "@/lib/pool-allocations"
import { POOL_LABELS } from "@/lib/strategy-presets"

type PoolMetricsStripProps = {
  poolAllocations: PoolAllocations
  pools: QuickSwapPool[]
  loading?: boolean
}

export function PoolMetricsStrip({
  poolAllocations,
  pools,
  loading = false,
}: PoolMetricsStripProps) {
  const poolById = Object.fromEntries(pools.map((pool) => [pool.id, pool]))
  const activeIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id)

  if (activeIds.length === 0) {
    return null
  }

  return (
    <div className="border border-border">
      <p className="border-b border-border px-4 py-3 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        Live pool prices
      </p>
      <div className="flex gap-px overflow-x-auto bg-border">
        {activeIds.map((poolId) => {
          const pool = poolById[poolId]
          const label = POOL_LABELS[poolId] ?? pool?.label ?? poolId
          return (
            <div
              key={poolId}
              className="min-w-[200px] flex-1 bg-background px-4 py-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${POOL_MARKET_COLORS[poolId] ?? "bg-muted-foreground"}`}
                />
                <span className="font-mono text-xs text-foreground">{label}</span>
              </div>
              {loading && !pool ? (
                <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
              ) : pool?.metrics.priceLabel ? (
                <p className="font-mono text-sm text-foreground">
                  {pool.metrics.priceLabel}
                </p>
              ) : (
                <p className="font-mono text-[10px] text-muted-foreground">—</p>
              )}
              {pool?.metrics.feeApr != null && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  est. APR {pool.metrics.feeApr.toFixed(2)}%
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
