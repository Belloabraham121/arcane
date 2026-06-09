"use client"

import { PoolAllocationStrip } from "@/components/dashboard/pool-allocation-strip"
import { PoolStatsBadges } from "@/components/pool-stats-badges"
import { formatUsd } from "@/lib/portfolio-display"
import type { ActivePoolRow } from "@/lib/trading-helpers"

type ActivePoolsPanelProps = {
  pools: ActivePoolRow[]
}

export function ActivePoolsPanel({ pools }: ActivePoolsPanelProps) {
  if (pools.length === 0) {
    return (
      <div className="border border-border p-6">
        <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Active pools
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          No QuickSwap pools allocated. Edit setup to assign capital.
        </p>
      </div>
    )
  }

  const stripSegments = pools.map((pool) => ({
    id: pool.poolId,
    color: pool.color,
    weight: pool.currentPercent ?? pool.targetPercent,
    label: `${pool.label} — ${(pool.currentPercent ?? pool.targetPercent).toFixed(1)}%${
      pool.allocatedValueUsd != null
        ? ` ($${formatUsd(pool.allocatedValueUsd, { maximumFractionDigits: 0 })})`
        : ""
    }`,
  }))

  return (
    <div className="border border-border p-6">
      <p className="mb-3 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        Active pools
      </p>

      <PoolAllocationStrip
        segments={stripSegments}
        className="mb-4"
        heightClassName="h-2.5"
      />

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        {pools.map((pool) => (
          <div key={pool.poolId} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: pool.color }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {pool.label}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {pools.map((pool) => {
          const livePercent = pool.currentPercent ?? pool.targetPercent
          return (
            <div
              key={pool.poolId}
              className="space-y-2 border-b border-border pb-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: pool.color }}
                    />
                    <span className="font-mono text-sm text-foreground">
                      {pool.label}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-4 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {pool.pair}
                  </p>
                  <div className="mt-1 pl-4">
                    <PoolStatsBadges
                      tvlUsd={pool.tvlUsd}
                      volumeUsd={pool.volumeUsd}
                      liquidity={pool.liquidity}
                      apy={pool.apy}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono text-xs">
                  <p className="text-muted-foreground">
                    target {pool.targetPercent.toFixed(1)}%
                  </p>
                  {pool.allocatedValueUsd != null && (
                    <p className="mt-0.5 text-foreground">
                      $
                      {formatUsd(pool.allocatedValueUsd, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="pl-4">
                <div className="relative h-2 overflow-hidden rounded bg-border">
                  <div
                    className="absolute inset-y-0 left-0 rounded opacity-25"
                    style={{
                      width: `${Math.min(pool.targetPercent, 100)}%`,
                      backgroundColor: pool.color,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${Math.min(livePercent, 100)}%`,
                      backgroundColor: pool.color,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span>
                    Current{" "}
                    {pool.currentPercent != null
                      ? `${pool.currentPercent.toFixed(1)}%`
                      : "—"}
                  </span>
                  {pool.driftPercent != null && (
                    <span
                      className={
                        Math.abs(pool.driftPercent) > 5
                          ? "text-[#ea580c]"
                          : "text-muted-foreground"
                      }
                    >
                      drift {pool.driftPercent > 0 ? "+" : ""}
                      {pool.driftPercent.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
