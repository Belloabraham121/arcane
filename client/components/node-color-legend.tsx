"use client";

const LEGEND_ITEMS = [
  { label: "Uniswap", color: "#ff007a" },
  { label: "AAVE", color: "#7928ca" },
  { label: "Compound", color: "#00d4ff" },
  { label: "Lido", color: "#00a3e0" },
  { label: "Marketplace", color: "#00ff88" },
] as const;

export function NodeColorLegend() {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-[min(100%,56rem)] px-4">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded border border-border bg-black/90 px-4 py-2.5 text-xs font-mono">
        <span className="text-muted-foreground uppercase tracking-widest text-[10px] mr-1">
          Nodes
        </span>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-foreground/90 whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
