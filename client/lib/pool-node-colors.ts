/** Distinct hues for canvas nodes — cycles when strategy has many pools. */
export const CANVAS_POOL_PALETTE = [
  "#a855f7",
  "#3b82f6",
  "#22c55e",
  "#ea580c",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#84cc16",
] as const

export function poolNodePaletteColor(index: number): string {
  return CANVAS_POOL_PALETTE[index % CANVAS_POOL_PALETTE.length]!
}
