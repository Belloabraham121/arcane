"use client"

import type { AccountMode } from "@/lib/api/auth"
import { POOL_MARKET_COLORS } from "@/lib/pool-allocations"
import { POOL_LABELS } from "@/lib/strategy-presets"

const POOL_HEX: Record<string, string> = {
  "usdce-wsomi": "#a855f7",
  "usdce-weth": "#3b82f6",
  "wsomi-weth": "#22c55e",
}

type PoolNodesLegendProps = {
  poolIds: string[]
  accountMode?: AccountMode
}

export function PoolNodesLegend({
  poolIds,
  accountMode,
}: PoolNodesLegendProps) {
  const isDemo = accountMode === "demo"

  if (poolIds.length === 0) {
    return (
      <p className="font-mono text-[10px] text-muted-foreground">
        No pools allocated.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {poolIds.map((id) => (
          <div key={id} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: POOL_HEX[id] ?? "#ea580c" }}
            />
            <span className="whitespace-nowrap text-foreground/90">
              {POOL_LABELS[id] ?? id}
            </span>
            <span
              className={`hidden h-2 w-2 rounded-full sm:inline-block ${POOL_MARKET_COLORS[id] ?? ""}`}
            />
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
        <p>• Orange octahedron = your agent wallet</p>
        <p>• Wireframe nodes = QuickSwap liquidity pools</p>
        <p>
          • Agent animates pool → pool on{" "}
          {isDemo
            ? "demo fork swap events (paper trading)"
            : "live mainnet swap events"}
        </p>
      </div>
    </div>
  )
}
