/** Central Marketplace hub position on the pool trading canvas. */
export const MARKETPLACE_CANVAS_POSITION: [number, number, number] = [0, 6, 0]

export const MARKETPLACE_CANVAS_COLOR = "#00ff88"

export type MarketplaceTripPhase =
  | "idle"
  | "to_marketplace"
  | "at_marketplace"
  | "to_pool"

export type SubAgentMarketplaceTrip = {
  phase: MarketplaceTripPhase
  progress: number
  homePoolIndex: number
  /** 0–1 pulse after successful purchase */
  dataPulse: number
  productId?: string
}

export type MarketplaceTripCommand = {
  phase: Exclude<MarketplaceTripPhase, "idle"> | "idle"
  homePoolIndex: number
  productId?: string
  triggerDataPulse?: boolean
}

export function defaultMarketplaceTrip(
  homePoolIndex = 0,
): SubAgentMarketplaceTrip {
  return {
    phase: "idle",
    progress: 0,
    homePoolIndex,
    dataPulse: 0,
  }
}
