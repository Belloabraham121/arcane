import { POOL_MARKET_COLORS } from "@/lib/pool-allocations"
import type { StrategyCanvasPool } from "@/lib/pool-resolve"
import { POOL_LABELS } from "@/lib/strategy-presets"

const POOL_HEX_COLORS: Record<string, string> = {
  "usdce-wsomi": "#a855f7",
  "usdce-weth": "#3b82f6",
  "wsomi-weth": "#22c55e",
}

export type PoolNetworkNode = {
  id: string
  label: string
  position: [number, number, number]
  color: string
  radius: number
}

export function activePoolIds(allocations: Record<string, number>): string[] {
  return Object.entries(allocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id)
}

export function buildPoolNetworkNodes(
  canvasPools: StrategyCanvasPool[],
): PoolNetworkNode[] {
  const count = canvasPools.length
  if (count === 0) {
    return []
  }

  const radius = Math.max(18, count * 6)

  return canvasPools.map((pool, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2
    const tailwind = POOL_MARKET_COLORS[pool.poolId]
    return {
      id: pool.poolId,
      label: pool.label,
      position: [
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ] as [number, number, number],
      color: POOL_HEX_COLORS[pool.poolId] ?? "#ea580c",
      radius: 8 + (tailwind ? 2 : 0),
    }
  })
}

export function poolNodeIndex(nodes: PoolNetworkNode[], poolId: string | null): number {
  if (!poolId) {
    return -1
  }
  return nodes.findIndex((node) => node.id === poolId)
}
