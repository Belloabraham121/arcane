"use client"

import { useState } from "react"
import Link from "next/link"
import { Cpu } from "lucide-react"
import { AgentNetworkCanvas } from "@/components/agent-network-canvas"

export default function AgentsPage() {
  const [viewMode, setViewMode] = useState<"activity" | "reputation" | "tvl">("activity")
  const [protocolAmounts, setProtocolAmounts] = useState<Record<string, number>>({
    uniswap: 50000000,
    aave: 30000000,
    compound: 25000000,
    lido: 35000000,
  })

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      {/* Navbar */}
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <Link href="/dashboard">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <Cpu size={18} strokeWidth={1.5} className="text-foreground" />
                <span className="text-sm font-mono tracking-[0.15em] uppercase font-bold">
                  ARCANE
                </span>
              </div>
            </Link>
            <div className="text-xs font-mono text-muted-foreground">
              0x2848...1CB9
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">
              Agent Network | Real-Time Particle Visualization
            </div>
            <div className="flex items-center gap-4">
              <button className="text-xs font-mono tracking-widest uppercase hover:text-foreground transition-colors flex items-center gap-2">
                ⚙️ Settings
              </button>
              <Link href="/dashboard/deposit/auto">
                <button className="text-xs font-mono tracking-widest uppercase hover:text-foreground transition-colors">
                  Back
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas and Controls */}
      <div className="relative w-full h-[calc(100vh-120px)]">
        <AgentNetworkCanvas
          viewMode={viewMode}
          protocolAmounts={protocolAmounts}
          onProtocolAmountsChange={setProtocolAmounts}
        />

        {/* Graph Settings Panel */}
        <div className="absolute top-6 left-6 text-xs font-mono bg-black/90 border border-border rounded p-4 z-10">
          <p className="text-muted-foreground tracking-widest uppercase mb-3">Graph Settings</p>
          <div className="space-y-2">
            {(["activity", "reputation", "tvl"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`block text-left px-3 py-2 rounded transition-all ${
                  viewMode === mode
                    ? "bg-[#ea580c] text-background font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "activity" && "🔄 Activity Flow"}
                {mode === "reputation" && "⭐ Reputation Tiers"}
                {mode === "tvl" && "💰 TVL Distribution"}
              </button>
            ))}
          </div>
          <div className="border-t border-border mt-3 pt-3">
            <p className="text-muted-foreground text-xs mb-2">Node Size = TVL</p>
            <p className="text-muted-foreground text-xs">Orange = Your Agent</p>
          </div>
        </div>

        {/* Protocol Amount Controls */}
        <div className="absolute bottom-6 left-6 text-xs font-mono bg-black/90 border border-border rounded p-4 z-10 max-w-sm">
          <p className="text-muted-foreground tracking-widest uppercase mb-3">Protocol Allocation</p>
          <div className="space-y-3">
            {Object.entries(protocolAmounts).map(([key, amount]) => (
              <div key={key} className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wide">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount / 1000000}
                    onChange={(e) => {
                      const newAmount = Math.max(1, parseFloat(e.target.value) || 0) * 1000000
                      setProtocolAmounts(prev => ({
                        ...prev,
                        [key]: newAmount,
                      }))
                    }}
                    placeholder="0"
                    className="flex-1 bg-background border border-border px-2 py-1 text-foreground text-xs rounded"
                  />
                  <span className="text-muted-foreground flex items-center">M</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 right-6 text-xs font-mono bg-black/90 border border-border rounded p-4 z-10 max-w-xs">
          <p className="text-muted-foreground tracking-widest uppercase mb-2">LEGEND</p>
          <div className="space-y-2 text-muted-foreground">
            <p>• Large nodes = High TVL in protocols</p>
            <p>• Small nodes = Lower capital allocation</p>
            <p>• Orange lines = Active signal trades</p>
            <p>• Hover agents for detailed metrics</p>
          </div>
        </div>
      </div>
    </div>
  )
}
