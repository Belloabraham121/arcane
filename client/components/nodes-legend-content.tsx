"use client"

const LEGEND_ITEMS = [
  { label: "Uniswap", color: "#ff007a" },
  { label: "AAVE", color: "#7928ca" },
  { label: "Compound", color: "#00d4ff" },
  { label: "Lido", color: "#00a3e0" },
  { label: "Marketplace", color: "#00ff88" },
] as const

const AGENT_LEGEND = [
  { label: "Root — moves between protocols", color: "#a8a29e" },
  { label: "Sub (circle) — same color as root", color: "#ff007a" },
  { label: "Your agent (center)", color: "#ea580c" },
] as const

export function NodesLegendContent() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: item.color }}
            />
            <span className="whitespace-nowrap text-foreground/90">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2">
        {AGENT_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rotate-45 border border-border"
              style={{ backgroundColor: item.color }}
            />
            <span className="whitespace-nowrap text-[10px] text-foreground/80">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
