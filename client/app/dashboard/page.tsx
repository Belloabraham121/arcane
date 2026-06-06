"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { getMe } from "@/lib/api/auth"
import { getAgentStrategy } from "@/lib/api/strategy"
import type { AgentStrategy } from "@/lib/api/strategy-types"
import { APP_ROUTES, setupRouteFor } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import {
  PROTOCOL_LABELS,
} from "@/lib/strategy-presets"

const ease = [0.22, 1, 0.36, 1] as const

const MARKETS_DATA = [
  { name: "Morpho Gauntlet USDC Prime", color: "bg-purple-500", allocated: 66.7, value: 333450.026, apr: 9.55 },
  { name: "AAVE USDC", color: "bg-blue-500", allocated: 11.7, value: 55575.02, apr: 8.73 },
  { name: "Fluid USDC", color: "bg-orange-500", allocated: 8.1, value: 40418.19, apr: 8.11 },
  { name: "Compound USDC", color: "bg-green-500", allocated: 13.5, value: 67555.84, apr: 7.92 },
]

export default function DashboardPage() {
  const router = useRouter()
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "markets" | "agents">("overview")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      const [meResult, strategyResult] = await Promise.all([getMe(), getAgentStrategy()])
      if (meResult.success && meResult.data?.user.walletAddress) {
        setWalletAddress(meResult.data.user.walletAddress)
      }
      if (strategyResult.success && strategyResult.data?.strategy) {
        setStrategy(strategyResult.data.strategy)
      }
      setLoading(false)
    }

    load()
  }, [router])

  if (loading || !strategy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
        <p className="font-mono text-xs text-muted-foreground">Loading dashboard…</p>
      </div>
    )
  }

  const isAuto = strategy.strategyType === "auto"
  const depositedAmount = strategy.depositAmount
  const currentValue = depositedAmount * 1.0006
  const netEarned = depositedAmount * 0.0006
  const totalAPR = 16.43
  const enabledSubAgents = strategy.subAgents.filter((agent) => agent.enabled)

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <AppNavBar walletAddress={walletAddress} />

      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-muted-foreground">
              Dashboard — {isAuto ? "Auto yield" : "Custom strategy"} (active)
            </div>
            <button
              type="button"
              onClick={() =>
                router.push(`${setupRouteFor(strategy.strategyType)}?edit=1`)
              }
              className="font-mono text-xs uppercase tracking-widest text-[#ea580c] transition-colors hover:text-[#ff7a2a]"
            >
              Edit setup
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-12 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="space-y-8"
        >
          <div>
            <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
              Current value
            </p>
            <h1 className="text-6xl font-bold font-pixel tracking-tight text-foreground lg:text-7xl">
              ${currentValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Total deposited
              </p>
              <p className="text-lg font-mono font-bold">${depositedAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Net earned
              </p>
              <p className="text-lg font-mono font-bold text-[#ea580c]">
                ${netEarned.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Total APR
              </p>
              <p className="text-lg font-mono font-bold">%{totalAPR.toFixed(2)}</p>
            </div>
          </div>
        </motion.div>

        <div className="border-t border-border pt-8">
          <div className="mb-8 flex gap-8 border-b border-border">
            {(["overview", "markets", "agents"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative pb-3 font-mono text-sm uppercase tracking-widest transition-colors ${
                  activeTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="dashboard-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                  />
                )}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="border border-border p-6">
                <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Protocol allocation
                </p>
                <div className="space-y-3">
                  {Object.entries(strategy.protocolAllocations).map(([key, amount]) => {
                    const total = Object.values(strategy.protocolAllocations).reduce(
                      (sum, value) => sum + value,
                      0,
                    )
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="font-mono text-sm">{PROTOCOL_LABELS[key] ?? key}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : "0%"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="border border-border p-6">
                <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Active sub-agents
                </p>
                <div className="space-y-3">
                  {enabledSubAgents.map((agent) => (
                    <div key={agent.id}>
                      <p className="font-mono text-sm text-foreground">{agent.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#ea580c]">
                        {agent.model}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {agent.systemPrompt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "markets" && (
            <div className="space-y-6">
              <div className="flex h-2 gap-1 overflow-hidden rounded bg-border">
                {MARKETS_DATA.map((market, i) => (
                  <div key={i} className={market.color} style={{ flex: market.allocated }} />
                ))}
              </div>
              <div className="border border-border">
                {MARKETS_DATA.map((market, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-4 gap-4 border-b border-border p-4 last:border-b-0"
                  >
                    <div className="col-span-2 flex items-center gap-2 font-mono text-sm">
                      <div className={`h-3 w-3 rounded-full ${market.color}`} />
                      {market.name}
                    </div>
                    <div className="font-mono text-sm">{market.allocated.toFixed(1)}%</div>
                    <div className="font-mono text-sm">%{market.apr.toFixed(2)} APR</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="border border-border p-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-xs text-muted-foreground">
                  Your agent network is active on Somnia.
                </p>
                <Link
                  href={APP_ROUTES.agentCanvas}
                  className="shrink-0 border border-[#ea580c] px-4 py-2 font-mono text-xs uppercase tracking-widest text-[#ea580c] transition-colors hover:bg-[#ea580c]/10"
                >
                  View live agents
                </Link>
              </div>
              <ul className="space-y-2 font-mono text-sm text-foreground">
                <li>• Rebalance across yield markets</li>
                <li>• Swap via Uniswap pools</li>
                <li>• Supply to Aave / Compound / Lido</li>
                <li>• Monitor APR and migrate capital</li>
              </ul>
              <p className="font-mono text-xs text-muted-foreground">
                Open the live canvas to watch root and sub-agents move between protocol
                nodes in real time.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
