"use client"

import type { ActivePoolRow } from "@/lib/trading-helpers"
import { POOL_MARKET_COLORS } from "@/lib/pool-allocations"

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

  return (
    <div className="border border-border p-6">
      <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        Active pools
      </p>
      <div className="space-y-4">
        {pools.map((pool) => (
          <div key={pool.poolId} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${POOL_MARKET_COLORS[pool.poolId] ?? "bg-muted-foreground"}`}
                />
                <span className="font-mono text-sm text-foreground">{pool.label}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                target {pool.targetPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded bg-border">
              <div
                className={`${POOL_MARKET_COLORS[pool.poolId] ?? "bg-muted-foreground"} opacity-80`}
                style={{ width: `${Math.min(pool.targetPercent, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
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
        ))}
      </div>
    </div>
  )
}
