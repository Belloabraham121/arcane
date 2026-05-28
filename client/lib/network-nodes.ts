import type { NetworkLayoutConfig, ProtocolNodeId } from "@/lib/network-layout-config"

export type NetworkNodeKind = "protocol" | "marketplace"

export type NetworkNode = {
  id: string
  name: string
  position: [number, number, number]
  color: string
  radius: number
  scale: [number, number, number]
  kind: NetworkNodeKind
}

const PROTOCOL_COLORS: Record<ProtocolNodeId, string> = {
  uniswap: "#ff007a",
  aave: "#7928ca",
  compound: "#00d4ff",
  lido: "#00a3e0",
}

const PROTOCOL_NAMES: Record<ProtocolNodeId, string> = {
  uniswap: "Uniswap",
  aave: "AAVE",
  compound: "Compound",
  lido: "Lido",
}

export function buildNetworkNodes(layout: NetworkLayoutConfig): NetworkNode[] {
  const protocolNodes: NetworkNode[] = (
    Object.keys(layout.protocols) as ProtocolNodeId[]
  ).map((id) => {
    const node = layout.protocols[id]
    return {
      id,
      name: PROTOCOL_NAMES[id],
      position: [node.positionX, 0, node.positionZ] as [number, number, number],
      color: PROTOCOL_COLORS[id],
      radius: node.radius,
      scale: [node.width, node.height, node.width] as [number, number, number],
      kind: "protocol",
    }
  })

  const marketplace: NetworkNode = {
    id: "marketplace",
    name: "Marketplace",
    position: [0, layout.buySignals.positionY, 0],
    color: "#00ff88",
    radius: layout.buySignals.radius,
    scale: [
      layout.buySignals.width,
      layout.buySignals.height,
      layout.buySignals.width,
    ],
    kind: "marketplace",
  }

  return [...protocolNodes, marketplace]
}

export const MARKETPLACE_NODE_INDEX = 4
