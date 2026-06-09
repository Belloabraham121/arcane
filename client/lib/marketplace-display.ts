import type { MarketplaceProductPricesSttWei } from "@/lib/api/strategy-types"

const STT_DECIMALS = 18n
const STT_SCALE = 10n ** STT_DECIMALS

/** Sub-agent → Marketplace product mapping (mirrors backend v1). */
export const SUB_AGENT_MARKETPLACE_PRODUCTS: Partial<
  Record<string, keyof MarketplaceProductPricesSttWei>
> = {
  "signal-scout": "signals/spread",
  "bridge-scout": "signals/cross-chain",
  "risk-manager": "pools/snapshot",
  "yield-executor": "pools/snapshot",
}

export function subAgentHasMarketplaceProduct(agentId: string): boolean {
  return SUB_AGENT_MARKETPLACE_PRODUCTS[agentId] != null
}

export function marketplaceProductLabel(productId: string): string {
  switch (productId) {
    case "pools/snapshot":
      return "Pool snapshot"
    case "signals/spread":
      return "Spread signal"
    case "signals/cross-chain":
      return "Cross-chain signal"
    default:
      return productId
  }
}

export function formatSttWei(wei: string): string {
  try {
    const value = BigInt(wei)
    if (value === 0n) {
      return "0 STT"
    }
    const whole = value / STT_SCALE
    const fraction = value % STT_SCALE
    if (fraction === 0n) {
      return `${whole} STT`
    }
    const stt = Number(value) / Number(STT_SCALE)
    if (stt >= 0.0001) {
      return `${stt.toFixed(4)} STT`
    }
    return `${wei} wei`
  } catch {
    return wei
  }
}

export function sttInputToWei(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null
  }
  const [wholePart, fractionPart = ""] = trimmed.split(".")
  const paddedFraction = `${fractionPart}000000000000000000`.slice(0, 18)
  try {
    const wei =
      BigInt(wholePart || "0") * STT_SCALE + BigInt(paddedFraction || "0")
    if (wei < 0n) {
      return null
    }
    return wei.toString()
  } catch {
    return null
  }
}

export function weiToSttInput(wei: string): string {
  try {
    const value = BigInt(wei)
    const whole = value / STT_SCALE
    const fraction = value % STT_SCALE
    if (fraction === 0n) {
      return whole.toString()
    }
    const fractionStr = fraction.toString().padStart(18, "0").replace(/0+$/, "")
    return `${whole}.${fractionStr}`
  } catch {
    return ""
  }
}

export function sumSttWei(values: string[]): string {
  let total = 0n
  for (const value of values) {
    try {
      total += BigInt(value)
    } catch {
      // skip invalid
    }
  }
  return total.toString()
}
