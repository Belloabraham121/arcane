"use client"

import type { AccountMode } from "@/lib/api/auth"
import type { StrategyCanvasPool } from "@/lib/pool-resolve"

type PoolNodesLegendProps = {
  canvasPools: StrategyCanvasPool[]
  accountMode?: AccountMode
}

export function PoolNodesLegend({
  canvasPools,
  accountMode,
}: PoolNodesLegendProps) {
  const isDemo = accountMode === "demo"

  if (canvasPools.length === 0) {
    return (
      <p className="font-mono text-[10px] text-muted-foreground">
        No pools in your strategy. Edit setup to add QuickSwap pools.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {canvasPools.length} pool{canvasPools.length === 1 ? "" : "s"} in strategy
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {canvasPools.map((pool) => (
          <div key={pool.poolId} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: pool.color }}
            />
            <span className="whitespace-nowrap text-foreground/90">
              {pool.label}
            </span>
            <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
              {pool.pair}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
        <p>• Orange octahedron = root agent (executes swaps between pools)</p>
        <p>• Colored wireframe spheres = QuickSwap pools from your strategy</p>
        <p>• Colored tetrahedrons = sub-agents (read-only data advisors)</p>
        <p>• Dashed lines = data flow from sub-agents → root agent</p>
        <p>
          • Root agent animates pool → pool on{" "}
          {isDemo
            ? "demo fork swap events (paper trading)"
            : "live mainnet swap events"}
        </p>
      </div>
    </div>
  )
}
