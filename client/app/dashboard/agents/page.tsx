"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Cpu } from "lucide-react"
import { AgentNetworkCanvas } from "@/components/agent-network-canvas"
import { AgentTradeFeed } from "@/components/agent-trade-feed"
import { DraggableGridPanel } from "@/components/draggable-grid-panel"
import { NodesLegendContent } from "@/components/nodes-legend-content"
import { useTradeEvents } from "@/hooks/use-trade-events"
import {
  GRID_SIZE,
  snapToGrid,
  usePanelLayout,
  type PanelId,
} from "@/hooks/use-panel-layout"

export default function AgentsPage() {
  const [viewMode, setViewMode] = useState<"activity" | "reputation" | "tvl">(
    "activity"
  )
  const [protocolAmounts, setProtocolAmounts] = useState<
    Record<string, number>
  >({
    uniswap: 50000000,
    aave: 30000000,
    compound: 25000000,
    lido: 35000000,
  })
  const { events, pushEvent } = useTradeEvents()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const { layouts, updatePanel, toggleCollapsed, hydrated } = usePanelLayout()
  const [defaultsApplied, setDefaultsApplied] = useState(false)

  useEffect(() => {
    if (!hydrated || defaultsApplied || !workspaceRef.current) return
    const hasStoredLayout =
      typeof window !== "undefined" &&
      !!localStorage.getItem("arcane-agents-panel-layout")
    if (!hasStoredLayout) {
      const h = workspaceRef.current.clientHeight
      updatePanel("protocol-allocation", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 280)),
      })
      updatePanel("legend", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 200)),
      })
      updatePanel("viz-info", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 120)),
      })
    }
    setDefaultsApplied(true)
  }, [hydrated, defaultsApplied, updatePanel])

  const setPosition = (id: PanelId) => (x: number, y: number) => {
    updatePanel(id, { x, y })
  }

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <nav className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <Link href="/dashboard">
              <div className="flex cursor-pointer items-center gap-3 transition-opacity hover:opacity-80">
                <Cpu size={18} strokeWidth={1.5} className="text-foreground" />
                <span className="text-sm font-mono font-bold uppercase tracking-[0.15em]">
                  ARCANE
                </span>
              </div>
            </Link>
            <div className="font-mono text-xs text-muted-foreground">
              0x2848...1CB9
            </div>
          </div>
        </div>
      </nav>

      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-muted-foreground">
              Agent Network | Real-Time Particle Visualization
            </div>
            <Link href="/dashboard/deposit/auto">
              <button className="font-mono text-xs uppercase tracking-widest transition-colors hover:text-foreground">
                Back
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div
        ref={workspaceRef}
        className="relative h-[calc(100vh-120px)] w-full overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      >
        <AgentNetworkCanvas
          viewMode={viewMode}
          protocolAmounts={protocolAmounts}
          onTradeEvent={pushEvent}
        />

        <DraggableGridPanel
          id="graph-settings"
          title="Graph Settings"
          x={layouts["graph-settings"].x}
          y={layouts["graph-settings"].y}
          collapsed={layouts["graph-settings"].collapsed}
          onPositionChange={setPosition("graph-settings")}
          onToggleCollapsed={() => toggleCollapsed("graph-settings")}
          containerRef={workspaceRef}
          width={240}
        >
          <div className="space-y-2">
            {(["activity", "reputation", "tvl"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`block w-full rounded px-3 py-2 text-left transition-all ${
                  viewMode === mode
                    ? "bg-[#ea580c] font-bold text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "activity" && "Activity Flow"}
                {mode === "reputation" && "Reputation Tiers"}
                {mode === "tvl" && "TVL Distribution"}
              </button>
            ))}
          </div>
        </DraggableGridPanel>

        <DraggableGridPanel
          id="nodes-legend"
          title="Nodes"
          x={layouts["nodes-legend"].x}
          y={layouts["nodes-legend"].y}
          collapsed={layouts["nodes-legend"].collapsed}
          onPositionChange={setPosition("nodes-legend")}
          onToggleCollapsed={() => toggleCollapsed("nodes-legend")}
          containerRef={workspaceRef}
          width={520}
          contentClassName="py-2"
        >
          <NodesLegendContent />
        </DraggableGridPanel>

        <DraggableGridPanel
          id="live-trades"
          title="Live Trades"
          x={layouts["live-trades"].x}
          y={layouts["live-trades"].y}
          collapsed={layouts["live-trades"].collapsed}
          onPositionChange={setPosition("live-trades")}
          onToggleCollapsed={() => toggleCollapsed("live-trades")}
          containerRef={workspaceRef}
          width={320}
          alignRight
          contentClassName="p-0"
        >
          <AgentTradeFeed
            events={events}
            className="max-h-[min(50vh,360px)] border-0 bg-transparent"
          />
        </DraggableGridPanel>

        <DraggableGridPanel
          id="legend"
          title="Legend"
          x={layouts.legend.x}
          y={layouts.legend.y}
          collapsed={layouts.legend.collapsed}
          onPositionChange={setPosition("legend")}
          onToggleCollapsed={() => toggleCollapsed("legend")}
          containerRef={workspaceRef}
          width={280}
          alignRight
        >
          <div className="space-y-2 text-muted-foreground">
            <p>• Pink node = Uniswap</p>
            <p>• Purple node = AAVE</p>
            <p>• Cyan node = Compound</p>
            <p>• Blue node = Lido</p>
            <p>• Green top node = Marketplace</p>
            <p>• Gray trails = Agent routes</p>
          </div>
        </DraggableGridPanel>

        <DraggableGridPanel
          id="protocol-allocation"
          title="Protocol Allocation"
          x={layouts["protocol-allocation"].x}
          y={layouts["protocol-allocation"].y}
          collapsed={layouts["protocol-allocation"].collapsed}
          onPositionChange={setPosition("protocol-allocation")}
          onToggleCollapsed={() => toggleCollapsed("protocol-allocation")}
          containerRef={workspaceRef}
          width={300}
        >
          <div className="space-y-3">
            {Object.entries(protocolAmounts).map(([key, amount]) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount / 1000000}
                    onChange={(e) => {
                      const newAmount =
                        Math.max(1, parseFloat(e.target.value) || 0) *
                        1000000
                      setProtocolAmounts((prev) => ({
                        ...prev,
                        [key]: newAmount,
                      }))
                    }}
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                  />
                  <span className="flex items-center text-muted-foreground">
                    M
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DraggableGridPanel>

        <DraggableGridPanel
          id="viz-info"
          title="Visualization"
          x={layouts["viz-info"].x}
          y={layouts["viz-info"].y}
          collapsed={layouts["viz-info"].collapsed}
          onPositionChange={setPosition("viz-info")}
          onToggleCollapsed={() => toggleCollapsed("viz-info")}
          containerRef={workspaceRef}
          width={280}
        >
          <div className="space-y-1 text-muted-foreground">
            <p>Agents route to all nodes including Marketplace.</p>
            <p>View mode: {viewMode.toUpperCase()}</p>
            <p className="text-[10px]">
              Hold the grip icon to drag. Panels snap to the grid.
            </p>
          </div>
        </DraggableGridPanel>
      </div>
    </div>
  )
}
