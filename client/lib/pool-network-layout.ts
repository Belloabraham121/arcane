import type { StrategyCanvasPool } from "@/lib/pool-resolve"

export { CANVAS_POOL_PALETTE, poolNodePaletteColor } from "@/lib/pool-node-colors"

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
    return {
      id: pool.poolId,
      label: pool.label,
      position: [
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ] as [number, number, number],
      color: pool.color,
      radius: 9,
    }
  })
}

export function poolNodeIndex(nodes: PoolNetworkNode[], poolId: string | null): number {
  if (!poolId) {
    return -1
  }
  return nodes.findIndex((node) => node.id === poolId)
}
