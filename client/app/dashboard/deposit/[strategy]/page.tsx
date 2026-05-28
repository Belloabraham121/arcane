"use client"

import Link from "next/link"
import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, Cpu } from "lucide-react"

const ease = [0.22, 1, 0.36, 1] as const

interface DepositPageProps {
  params: {
    strategy: "auto" | "custom"
  }
}

const MARKETS_DATA = [
  { name: "Morpho Gauntlet USDC Prime", color: "bg-purple-500", allocated: 66.7, value: 333450.026, apr: 9.55 },
  { name: "AAVE USDC", color: "bg-blue-500", allocated: 11.7, value: 55575.02, apr: 8.73 },
  { name: "Fluid USDC", color: "bg-orange-500", allocated: 8.1, value: 40418.19, apr: 8.11 },
  { name: "Compound USDC", color: "bg-green-500", allocated: 13.5, value: 67555.84, apr: 7.92 },
]

export default function DepositPage({ params }: DepositPageProps) {
  const [activeTab, setActiveTab] = useState<"markets" | "performance" | "agent">("markets")
  const [depositAmount, setDepositAmount] = useState("500000")

  const strategyTitle = params.strategy === "auto" ? "AUTO YIELD" : "CUSTOM STRATEGY"
  const currentValue = 500299.35
  const totalDeposited = 500000
  const netEarned = 299.35
  const totalAPR = 16.43

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

      {/* Capital/Strategy Display Section */}
      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">
              Hey, {strategyTitle === "AUTO YIELD" ? "Arcane routed" : "You configured"} your capital to{" "}
              <span className="text-foreground">{strategyTitle === "AUTO YIELD" ? "top yield" : "your strategy"}</span>
            </div>
            <div className="flex items-center gap-6">
              <button className="text-xs font-mono tracking-widest uppercase hover:text-foreground transition-colors flex items-center gap-2">
                <span>📤</span> Deposit
              </button>
              <button className="text-xs font-mono tracking-widest uppercase hover:text-foreground transition-colors flex items-center gap-2">
                <span>📥</span> Withdraw
              </button>
              <button className="text-xs font-mono tracking-widest uppercase hover:text-foreground transition-colors">
                Base
              </button>
              <div className="text-xs font-mono text-muted-foreground">0xacab...8019</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12 lg:px-12 space-y-12">
        {/* Current Value Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="space-y-8 pb-8"
        >
          <div className="space-y-4">
            <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Current value</p>
            <h1 className="text-6xl lg:text-7xl font-bold font-pixel text-foreground tracking-tight">
              ${currentValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
          </div>

          {/* Metrics Row */}
          <div className="flex items-end justify-between">
            <div className="grid grid-cols-3 gap-12">
              <div>
                <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Total deposited</p>
                <p className="text-lg font-mono font-bold text-foreground">${totalDeposited.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Net earned</p>
                <p className="text-lg font-mono font-bold text-[#ea580c]">${netEarned.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Total APR</p>
                <p className="text-lg font-mono font-bold text-foreground">%{totalAPR.toFixed(2)}</p>
              </div>
            </div>

            {/* Active Markets */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Active markets</p>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {MARKETS_DATA.slice(0, 4).map((market, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full border border-background ${market.color}`}
                        title={market.name}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-mono font-bold text-foreground">{MARKETS_DATA.length} markets</span>
                </div>
              </div>
              <button className="px-4 py-2 border border-border text-xs font-mono uppercase hover:bg-foreground/5 transition-colors">
                Edit
              </button>
            </div>
          </div>
        </motion.div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Tab Navigation */}
        <div className="space-y-8">
          <div className="flex gap-8 border-b border-border">
            {(["markets", "performance", "agent"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-mono tracking-widest uppercase transition-colors relative ${
                  activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === "markets" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Color Distribution Bar */}
                <div className="flex h-2 gap-1 bg-border rounded overflow-hidden">
                  {MARKETS_DATA.map((market, i) => (
                    <div
                      key={i}
                      className={`${market.color}`}
                      style={{ flex: market.allocated }}
                    />
                  ))}
                </div>

                {/* Markets Table */}
                <div className="border border-border">
                  <div className="grid grid-cols-5 gap-4 p-4 border-b border-border bg-foreground/5">
                    <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Market</div>
                    <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Protocols</div>
                    <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Allocated</div>
                    <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Value</div>
                    <div className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Current APR</div>
                  </div>

                  {MARKETS_DATA.map((market, i) => (
                    <div key={i} className="grid grid-cols-5 gap-4 p-4 border-b border-border last:border-b-0 hover:bg-foreground/5 transition-colors">
                      <div className="text-sm font-mono text-foreground flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${market.color}`} />
                        {market.name}
                      </div>
                      <div className="text-sm font-mono text-foreground flex items-center">
                        <div className={`w-5 h-5 rounded-full border ${market.color}/30`} />
                      </div>
                      <div className="text-sm font-mono text-foreground flex items-center">
                        {market.allocated.toFixed(1)}%
                      </div>
                      <div className="text-sm font-mono text-foreground">${market.value.toLocaleString()}</div>
                      <div className="text-sm font-mono text-foreground">%{market.apr.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "performance" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Vault Performance</p>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="border border-border p-6">
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-3">24h Return</p>
                      <p className="text-2xl font-mono font-bold text-[#ea580c]">+0.23%</p>
                    </div>
                    <div className="border border-border p-6">
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-3">7d Return</p>
                      <p className="text-2xl font-mono font-bold text-[#ea580c]">+1.64%</p>
                    </div>
                    <div className="border border-border p-6">
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-3">30d Return</p>
                      <p className="text-2xl font-mono font-bold text-[#ea580c]">+4.17%</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  Your agent has optimized your portfolio to achieve a weighted average APR of <span className="text-[#ea580c] font-bold">16.43%</span> across all allocated markets.
                </p>
              </motion.div>
            )}

            {activeTab === "agent" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Agent Details</p>
                    <Link href="/dashboard/agents">
                      <button className="text-xs font-mono tracking-widest uppercase px-4 py-2 border border-[#ea580c] text-[#ea580c] hover:bg-[#ea580c]/10 transition-colors">
                        View Agents
                      </button>
                    </Link>
                  </div>
                  <div className="border border-border p-6 space-y-4">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Agent ID</p>
                      <p className="text-sm font-mono text-foreground">0x7a2f...4b8e</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Reputation Score</p>
                      <p className="text-sm font-mono text-foreground">847 / 1000</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Win Rate</p>
                      <p className="text-sm font-mono text-[#ea580c]">67.3%</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">Total Signals Generated</p>
                      <p className="text-sm font-mono text-foreground">847</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
