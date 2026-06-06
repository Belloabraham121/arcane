"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { AgentNetworkCanvas } from "@/components/agent-network-canvas"
import { AgentTradeFeed } from "@/components/agent-trade-feed"
import { DraggableGridPanel } from "@/components/draggable-grid-panel"
import { NodesLegendContent } from "@/components/nodes-legend-content"
import { useTradeEvents } from "@/hooks/use-trade-events"
import { getMe } from "@/lib/api/auth"
import { getAgentStrategy } from "@/lib/api/strategy"
import {
  DEFAULT_PROTOCOL_ALLOCATIONS,
  type ProtocolAllocations,
} from "@/lib/api/strategy-types"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import {
  GRID_SIZE,
  snapToGrid,
  usePanelLayout,
  type PanelId,
} from "@/hooks/use-panel-layout"

export default function AgentsPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<"activity" | "reputation" | "tvl">(
    "activity",
  )
  const [protocolAmounts, setProtocolAmounts] = useState<ProtocolAllocations>(
    DEFAULT_PROTOCOL_ALLOCATIONS,
  )
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { events, pushEvent } = useTradeEvents()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const { layouts, updatePanel, toggleCollapsed, hydrated } = usePanelLayout()
  const [defaultsApplied, setDefaultsApplied] = useState(false)

  useEffect(() => {
    async function load() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      const [meResult, strategyResult] = await Promise.all([
        getMe(),
        getAgentStrategy(),
      ])

      if (meResult.success && meResult.data?.user.walletAddress) {
        setWalletAddress(meResult.data.user.walletAddress)
      }

      if (strategyResult.success && strategyResult.data?.strategy) {
        setProtocolAmounts(strategyResult.data.strategy.protocolAllocations)
      }

      setLoading(false)
    }

    load()
  }, [router])

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
        <p className="font-mono text-xs text-muted-foreground">Loading agent network…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <AppNavBar walletAddress={walletAddress} />

      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-muted-foreground">
              Agent Network | Real-Time Particle Visualization
            </div>
            <Link
              href={APP_ROUTES.dashboard}
              className="font-mono text-xs uppercase tracking-widest transition-colors hover:text-foreground"
            >
              Back to dashboard
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
                className={`block w-full rounded border px-3 py-2 text-left transition-all ${
                  viewMode === mode
                    ? "border-[#ea580c] bg-[#ea580c] font-bold text-white"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-white hover:text-foreground"
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
            <p>• Gray trails = Sub route (root ↔ marketplace)</p>
            <p>• Small shape = Root (visits protocols)</p>
            <p>• Larger shape = Sub (follows its root)</p>
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
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
                <span className="font-mono text-xs text-foreground">
                  {(amount / 1_000_000).toFixed(0)}M
                </span>
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
