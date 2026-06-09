"use client"

import type { AccountMode } from "@/lib/api/auth"
import type { StrategyCanvasPool } from "@/lib/pool-resolve"

type PoolNodesLegendProps = {
  canvasPools: StrategyCanvasPool[]
  accountMode?: AccountMode
  marketplaceEnabled?: boolean
}

export function PoolNodesLegend({
  canvasPools,
  accountMode,
  marketplaceEnabled = false,
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
        <p>• Orange octahedron = agent (executes swaps, sits inside pool node)</p>
        <p>• Colored wireframe spheres = QuickSwap pools from your strategy</p>
        <p>• Colored tetrahedrons = sub-agents orbiting the pool ring</p>
        <p>
          • Agent moves pool → pool on{" "}
          {isDemo
            ? "demo fork swap events — sub-agents follow"
            : "live mainnet swap events — sub-agents follow"}
        </p>
        {marketplaceEnabled && (
          <p>
            • Green cube = Marketplace — sub-agents travel here to buy data via
            x402 (STT only)
          </p>
        )}
      </div>
    </div>
  )
}
