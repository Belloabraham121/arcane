"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { getMe } from "@/lib/api/auth"
import { fetchPools } from "@/lib/api/quickswap"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import { getAgentStrategy } from "@/lib/api/strategy"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  fetchTradingStatus,
  type TradingStatus,
} from "@/lib/api/trading"
import type { AgentStrategy } from "@/lib/api/strategy-types"
import { APP_ROUTES, setupRouteFor } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import { WalletBalancesList } from "@/components/setup/wallet-balances-list"
import { ActivePoolsPanel } from "@/components/dashboard/active-pools-panel"
import { AgentStatusBadge } from "@/components/dashboard/agent-status-badge"
import { LastTradeCard } from "@/components/dashboard/last-trade-card"
import { PoolMetricsStrip } from "@/components/dashboard/pool-metrics-strip"
import { useWalletBalances } from "@/hooks/use-wallet-balances"
import { useTradingSocket } from "@/hooks/use-trading-socket"
import { buildPoolMarketRows } from "@/lib/pool-allocations"
import { allocatedPoolIds } from "@/lib/supported-tokens"
import {
  buildActivePoolRows,
  deriveAgentDisplayStatus,
  lastTradeFromCycle,
  lastTradeFromHistoryDetail,
  type LastTradeInfo,
} from "@/lib/trading-helpers"

const ease = [0.22, 1, 0.36, 1] as const

export default function DashboardPage() {
  const router = useRouter()
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null)
  const [pools, setPools] = useState<QuickSwapPool[]>([])
  const [poolsError, setPoolsError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "markets" | "agents">("overview")
  const [loading, setLoading] = useState(true)
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null)
  const [lastTrade, setLastTrade] = useState<LastTradeInfo | null>(null)

  useEffect(() => {
    async function load() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      const [meResult, strategyResult, poolsResult] = await Promise.all([
        getMe(),
        getAgentStrategy(),
        fetchPools(),
      ])

      if (meResult.success && meResult.data?.user.walletAddress) {
        setWalletAddress(meResult.data.user.walletAddress)
      }
      if (strategyResult.success && strategyResult.data?.strategy) {
        setStrategy(strategyResult.data.strategy)
      }
      if (poolsResult.success && poolsResult.data) {
        setPools(poolsResult.data.pools)
      } else {
        setPoolsError(poolsResult.error?.message ?? "Failed to load QuickSwap pools")
      }

      setLoading(false)
    }

    load()
  }, [router])

  const refreshTradingData = useCallback(async () => {
    const [statusResult, historyResult] = await Promise.all([
      fetchTradingStatus(),
      fetchTradingHistory(1, 1),
    ])
    if (statusResult.success && statusResult.data) {
      setTradingStatus(statusResult.data.status)
    }

    const status = statusResult.success ? statusResult.data?.status : null
    const fromCycle = lastTradeFromCycle(
      status?.lastCycle ?? null,
      status?.lastCycleAt ?? null,
    )
    if (fromCycle) {
      setLastTrade(fromCycle)
      return
    }

    const latest = historyResult.success ? historyResult.data?.items[0] : undefined
    if (!latest) {
      setLastTrade(null)
      return
    }

    const detailResult = await fetchTradingCycleDetail(latest.id)
    if (detailResult.success && detailResult.data?.cycle) {
      setLastTrade(lastTradeFromHistoryDetail(detailResult.data.cycle))
    }
  }, [])

  const { connected: socketConnected, cycleActive: socketCycleActive } =
    useTradingSocket({
      enabled: strategy?.status === "active",
      onCycleStarted: () => {
        setTradingStatus((prev) =>
          prev ? { ...prev, phase: "analyzing" } : prev,
        )
      },
      onCycleCompleted: () => {
        void refreshTradingData()
      },
      onActionExecuted: () => {
        void refreshTradingData()
      },
    })

  useEffect(() => {
    if (!strategy || strategy.status !== "active") {
      return
    }

    let cancelled = false

    async function loadTradingStatus() {
      if (cancelled) {
        return
      }
      await refreshTradingData()
    }

    loadTradingStatus()
    const timer = window.setInterval(loadTradingStatus, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [strategy, refreshTradingData])

  const marketRows = useMemo(
    () =>
      strategy
        ? buildPoolMarketRows(strategy.poolAllocations, pools, strategy.depositAmount)
        : [],
    [strategy, pools],
  )

  const activePoolIds = useMemo(
    () => (strategy ? allocatedPoolIds(strategy.poolAllocations) : []),
    [strategy],
  )
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
  } = useWalletBalances(activePoolIds)

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
  const agentDisplayStatus = socketCycleActive
    ? tradingStatus?.lastCycle?.executedTransactions?.length
      ? "executing"
      : "analyzing"
    : deriveAgentDisplayStatus({
        strategyActive: strategy.status === "active",
        tradingStatus,
        walletBalances: balances,
      })
  const activePoolRows = buildActivePoolRows(
    strategy.poolAllocations,
    tradingStatus?.lastCycle?.poolDrift,
  )

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
            <div className="space-y-6">
            <PoolMetricsStrip
              poolAllocations={strategy.poolAllocations}
              pools={pools}
              loading={loading}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 border border-border px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Agent status
                </p>
                <AgentStatusBadge status={agentDisplayStatus} />
                {socketConnected && (
                  <span className="font-mono text-[10px] text-[#16a34a]">live</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] text-muted-foreground">
                {strategy.tradingEnabledAt && (
                  <span>
                    Since {new Date(strategy.tradingEnabledAt).toLocaleString()}
                  </span>
                )}
                {(tradingStatus?.lastCycleAt ?? strategy.lastCycleAt) && (
                  <span>
                    Last cycle{" "}
                    {new Date(
                      tradingStatus?.lastCycleAt ?? strategy.lastCycleAt!,
                    ).toLocaleString()}
                  </span>
                )}
                <Link
                  href={APP_ROUTES.tradingHistory}
                  className="uppercase tracking-widest text-[#ea580c] hover:text-[#ff7a2a]"
                >
                  Trading history
                </Link>
              </div>
            </div>

            {tradingStatus?.lastError && (
              <p className="border border-[#ea580c]/30 bg-[#ea580c]/5 px-4 py-3 font-mono text-xs text-[#ea580c]">
                {tradingStatus.lastError}
              </p>
            )}

            {tradingStatus?.lastCycle?.llmResponse && (
              <div className="border border-border px-4 py-4">
                <p className="mb-1 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Latest LLM summary
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {tradingStatus.lastCycle.llmResponse}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ActivePoolsPanel pools={activePoolRows} />
              <LastTradeCard trade={lastTrade} />
            </div>

            <div className="border border-border p-6">
              <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Active sub-agents
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="border border-border p-6">
              <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Agent wallet balances
              </p>
              <p className="mb-4 font-mono text-[10px] text-muted-foreground">
                Live balances on Somnia mainnet for tokens in your selected pools. The agent
                signs and submits swaps automatically — you never approve transactions in a wallet.
              </p>
              <WalletBalancesList
                balances={balances}
                loading={balancesLoading}
                error={balancesError}
                emptyLabel="No supported tokens in active pools"
              />
            </div>
            </div>
          )}

          {activeTab === "markets" && (
            <div className="space-y-6">
              <p className="font-mono text-xs text-muted-foreground">
                Live QuickSwap pools on Somnia mainnet — allocation from your agent strategy.
              </p>

              {poolsError && (
                <p className="font-mono text-xs text-[#ea580c]">{poolsError}</p>
              )}

              {marketRows.length === 0 ? (
                <p className="font-mono text-xs text-muted-foreground">
                  No pool allocations configured. Edit setup to assign capital to QuickSwap pools.
                </p>
              ) : (
                <>
                  <div className="flex h-2 gap-1 overflow-hidden rounded bg-border">
                    {marketRows.map((market) => (
                      <div
                        key={market.id}
                        className={market.color}
                        style={{ flex: market.allocated }}
                      />
                    ))}
                  </div>
                  <div className="border border-border">
                    {marketRows.map((market) => (
                      <div
                        key={market.id}
                        className="grid grid-cols-2 gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-5"
                      >
                        <div className="col-span-2 flex items-center gap-2 font-mono text-sm">
                          <div className={`h-3 w-3 shrink-0 rounded-full ${market.color}`} />
                          <div>
                            <p>{market.name}</p>
                            {market.priceHint && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {market.priceHint}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="font-mono text-sm">
                          <span className="text-muted-foreground lg:hidden">Allocated </span>
                          {market.allocated.toFixed(1)}%
                        </div>
                        <div className="font-mono text-sm">
                          <span className="text-muted-foreground lg:hidden">Value </span>$
                          {market.value.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="font-mono text-sm">
                          <span className="text-muted-foreground lg:hidden">Fee </span>
                          {market.feePercent != null
                            ? `${market.feePercent}% swap`
                            : "—"}
                          <span className="block text-[10px] text-muted-foreground">
                            Liq {market.liquidity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
                <li>• Rebalance across QuickSwap liquidity pools</li>
                <li>• Swap via Algebra V4 on Somnia mainnet</li>
                <li>• Monitor pool prices and migrate capital</li>
                <li>• Execute moves with Somnia LLM inference agent</li>
              </ul>
              <p className="font-mono text-xs text-muted-foreground">
                Open the live canvas to watch root and sub-agents move between pool
                nodes in real time.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
