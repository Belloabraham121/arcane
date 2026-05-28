export type NodeScale = {
  width: number
  height: number
}

export type ProtocolNodeId = "uniswap" | "aave" | "compound" | "lido"

export type ProtocolNodeLayout = NodeScale & {
  radius: number
  positionX: number
  positionZ: number
}

export type BuySignalsNodeLayout = NodeScale & {
  radius: number
  positionY: number
}

export type NetworkLayoutConfig = {
  global: {
    protocolSpread: number
    buySignalsY: number
  }
  protocols: Record<ProtocolNodeId, ProtocolNodeLayout>
  buySignals: BuySignalsNodeLayout
}

export const PROTOCOL_NODE_IDS: ProtocolNodeId[] = [
  "uniswap",
  "aave",
  "compound",
  "lido",
]

export const PROTOCOL_LABELS: Record<ProtocolNodeId, string> = {
  uniswap: "Uniswap",
  aave: "AAVE",
  compound: "Compound",
  lido: "Lido",
}

export const DEFAULT_NETWORK_LAYOUT: NetworkLayoutConfig = {
  global: {
    protocolSpread: 24,
    buySignalsY: 34,
  },
  protocols: {
    uniswap: { radius: 12, width: 1, height: 1, positionX: 24, positionZ: 24 },
    aave: { radius: 12, width: 1, height: 1, positionX: -24, positionZ: 24 },
    compound: { radius: 12, width: 1, height: 1, positionX: 24, positionZ: -24 },
    lido: { radius: 12, width: 1, height: 1, positionX: -24, positionZ: -24 },
  },
  buySignals: { radius: 12, width: 1, height: 1, positionY: 34 },
}

export function syncProtocolPositionsFromSpread(
  config: NetworkLayoutConfig
): NetworkLayoutConfig {
  const s = config.global.protocolSpread
  return {
    ...config,
    protocols: {
      uniswap: { ...config.protocols.uniswap, positionX: s, positionZ: s },
      aave: { ...config.protocols.aave, positionX: -s, positionZ: s },
      compound: { ...config.protocols.compound, positionX: s, positionZ: -s },
      lido: { ...config.protocols.lido, positionX: -s, positionZ: -s },
    },
    buySignals: {
      ...config.buySignals,
      positionY: config.global.buySignalsY,
    },
  }
}

export function formatLayoutCoordinatesForCopy(config: NetworkLayoutConfig): string {
  const lines: string[] = [
    "// Arcane canvas layout — copy into your config",
    "",
    "GLOBAL",
    `  distanceBetweenProtocols: ${config.global.protocolSpread}`,
    `  topNodeHeightY: ${config.global.buySignalsY}`,
    "",
  ]

  for (const id of PROTOCOL_NODE_IDS) {
    const node = config.protocols[id]
    lines.push(
      PROTOCOL_LABELS[id].toUpperCase(),
      `  position: [${node.positionX}, 0, ${node.positionZ}]`,
      `  radius: ${node.radius}`,
      `  width: ${node.width}`,
      `  height: ${node.height}`,
      ""
    )
  }

  const top = config.buySignals
  lines.push(
    "BUY SIGNALS (TOP)",
    `  position: [0, ${top.positionY}, 0]`,
    `  radius: ${top.radius}`,
    `  width: ${top.width}`,
    `  height: ${top.height}`,
    "",
    "--- JSON ---",
    JSON.stringify(config, null, 2)
  )

  return lines.join("\n")
}

export function formatLayoutMetricsForCopy(config: NetworkLayoutConfig): string {
  return formatLayoutCoordinatesForCopy(config)
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(textarea)
      return ok
    } catch {
      return false
    }
  }
}

export { copyTextToClipboard }
