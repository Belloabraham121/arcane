"use client"

const LEGEND_ITEMS = [
  { label: "Uniswap", color: "#ff007a" },
  { label: "AAVE", color: "#7928ca" },
  { label: "Compound", color: "#00d4ff" },
  { label: "Lido", color: "#00a3e0" },
  { label: "Marketplace (Buy Signals)", color: "#00ff88" },
] as const

export function NodesLegendContent() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-white/20"
            style={{ backgroundColor: item.color }}
          />
          <span className="whitespace-nowrap text-foreground/90">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
