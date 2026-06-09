"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { AccountModeBadge } from "@/components/layout/account-mode-badge"
import { AccountModeSwitch } from "@/components/layout/account-mode-switch"
import { PageSubBar } from "@/components/layout/page-sub-bar"
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
import { DemoDepositModal } from "@/components/dashboard/demo-deposit-modal"
import { LastTradeCard } from "@/components/dashboard/last-trade-card"
import { PoolMetricsStrip } from "@/components/dashboard/pool-metrics-strip"
import {
  ActivePoolsPanelSkeleton,
  DashboardHeroSkeleton,
  MarketsTableSkeleton,
  PoolMetricsStripSkeleton,
} from "@/components/skeletons/content-skeletons"
import { usePortfolioSummary } from "@/hooks/use-portfolio-summary"
import { useWalletBalances } from "@/hooks/use-wallet-balances"
import { useTradingSocket } from "@/hooks/use-trading-socket"
import { useSession } from "@/providers/session-provider"
import type { AccountMode } from "@/lib/api/auth"
import {
  baselineDepositHint,
  formatAprLine,
  formatUsd,
} from "@/lib/portfolio-display"
import { fetchPools } from "@/lib/api/quickswap"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"
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
  const {
    sessionReady,
    accountMode,
    demoWalletAddress,
    tradingWalletAddress,
    refreshSession,
  } = useSession()
  const [addressCopied, setAddressCopied] = useState(false)
  const [demoDepositOpen, setDemoDepositOpen] = useState(false)
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null)
  const [pools, setPools] = useState<QuickSwapPool[]>([])
  const [poolsError, setPoolsError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "markets" | "agents">("overview")
  const [strategyLoading, setStrategyLoading] = useState(true)
  const [poolsLoading, setPoolsLoading] = useState(true)
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null)
  const [lastTrade, setLastTrade] = useState<LastTradeInfo | null>(null)

  useEffect(() => {
    if (!sessionReady) {
      return
    }

    let cancelled = false

    async function loadStrategy() {
      const route = await resolvePostAuthRoute()
      if (cancelled) {
        return
      }
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      const strategyResult = await getAgentStrategy(accountMode ?? undefined)
      if (cancelled) {
        return
      }
      if (strategyResult.success && strategyResult.data?.strategy) {
        setStrategy(strategyResult.data.strategy)
      } else {
        setStrategy(null)
      }
      setStrategyLoading(false)
    }

    void loadStrategy()
  }, [router, sessionReady, accountMode])

  async function handleAccountModeSwitched(mode: AccountMode) {
    setStrategyLoading(true)
    setStrategy(null)
    await refreshSession()
    const strategyResult = await getAgentStrategy(mode)
    if (strategyResult.success && strategyResult.data?.strategy) {
      setStrategy(strategyResult.data.strategy)
      setStrategyLoading(false)
      return
    }
    setStrategyLoading(false)
    const route = await resolvePostAuthRoute()
    if (route !== APP_ROUTES.dashboard) {
      router.replace(route)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadPools() {
      const poolsResult = await fetchPools()
      if (cancelled) {
        return
      }
      if (poolsResult.success && poolsResult.data) {
        setPools(poolsResult.data.pools)
      } else {
        setPoolsError(poolsResult.error?.message ?? "Failed to load QuickSwap pools")
      }
      setPoolsLoading(false)
    }

    void loadPools()

    return () => {
      cancelled = true
    }
  }, [])

  const viewMode: AccountMode | undefined = accountMode ?? undefined

  const portfolioEnabled =
    Boolean(strategy?.status === "active" && viewMode != null)

  const {
    summary: portfolio,
    loading: portfolioLoading,
    error: portfolioError,
    reload: reloadPortfolio,
  } = usePortfolioSummary(viewMode, portfolioEnabled)

  const refreshTradingData = useCallback(async () => {
    if (!viewMode) {
      return
    }

    const [statusResult, historyResult] = await Promise.all([
      fetchTradingStatus(viewMode),
      fetchTradingHistory(1, 1, viewMode),
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
  }, [viewMode])

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
        void reloadPortfolio()
        void reloadBalances()
      },
      onActionExecuted: () => {
        void refreshTradingData()
        void reloadPortfolio()
        void reloadBalances()
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

  useEffect(() => {
    if (!strategy || strategy.status !== "active" || !viewMode) {
      return
    }
    void refreshTradingData()
  }, [viewMode, strategy, refreshTradingData])

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
    walletAddress: balanceWalletAddress,
    chainLabel: balanceChainLabel,
    reload: reloadBalances,
  } = useWalletBalances(
    strategy ? activePoolIds : [],
    30_000,
    viewMode,
  )

  const displayWalletAddress =
    balanceWalletAddress ??
    portfolio?.walletAddress ??
    (viewMode === "demo" ? demoWalletAddress : tradingWalletAddress)

  const isDemoView = viewMode === "demo"

  async function copyDisplayWalletAddress() {
    if (!displayWalletAddress) {
      return
    }
    await navigator.clipboard.writeText(displayWalletAddress)
    setAddressCopied(true)
    setTimeout(() => setAddressCopied(false), 2000)
  }

  const isAuto = strategy?.strategyType === "auto"
  const metricsLoading = strategyLoading || (portfolioEnabled && portfolioLoading)
  const currentValueUsd = portfolio?.currentValueUsd
  const baselineUsd = portfolio?.baselineUsd
  const netEarnedUsd = portfolio?.netEarnedUsd
  const aprLine =
    portfolio != null
      ? formatAprLine(portfolio.aprSinceActivation, portfolio.apr24h)
      : "—"
  const enabledSubAgents = strategy?.subAgents.filter((agent) => agent.enabled) ?? []
  const agentDisplayStatus = socketCycleActive
    ? tradingStatus?.lastCycle?.executedTransactions?.length
      ? "executing"
      : "analyzing"
    : strategy
      ? deriveAgentDisplayStatus({
          strategyActive: strategy.status === "active",
          tradingStatus,
          walletBalances: balances,
        })
      : "idle"
  const activePoolRows =
    strategy != null
      ? buildActivePoolRows(
          strategy.poolAllocations,
          tradingStatus?.lastCycle?.poolDrift,
          pools,
        )
      : []

  return (
    <>
      <PageSubBar
        title={
          strategyLoading
            ? "Dashboard"
            : `Dashboard — ${isAuto ? "Auto yield" : "Custom strategy"} (active)`
        }
        badge={viewMode ? <AccountModeBadge mode={viewMode} /> : undefined}
        action={
          sessionReady ? (
            <div className="flex shrink-0 items-center gap-4">
              <AccountModeSwitch
                onSwitched={(mode) => void handleAccountModeSwitched(mode)}
              />
              {strategy && !strategyLoading ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`${setupRouteFor(strategy.strategyType)}?edit=1`)
                  }
                  className="font-mono text-xs uppercase tracking-widest text-[#ea580c] transition-colors hover:text-[#ff7a2a]"
                >
                  Edit setup
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-12 lg:px-12">
        {metricsLoading || !strategy ? (
          <DashboardHeroSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="space-y-8"
          >
            {portfolioError && (
              <p className="border border-[#ea580c]/30 bg-[#ea580c]/5 px-4 py-3 font-mono text-xs text-[#ea580c]">
                {portfolioError}
              </p>
            )}

            {(portfolio?.chainLabel ?? balanceChainLabel) && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {portfolio?.chainLabel ?? balanceChainLabel}
                {portfolio && portfolio.unpricedSymbols.length > 0 &&
                  ` · unpriced: ${portfolio.unpricedSymbols.join(", ")}`}
              </p>
            )}

            {displayWalletAddress && (
              <div className="flex flex-wrap items-center gap-3 border border-border bg-muted/20 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {isDemoView ? "Demo wallet (simulation)" : "Agent wallet (mainnet)"}
                  </p>
                  <code className="break-all font-mono text-xs text-foreground">
                    {displayWalletAddress}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => void copyDisplayWalletAddress()}
                  className="flex shrink-0 items-center gap-2 border border-border px-3 py-2 font-mono text-xs uppercase tracking-widest hover:bg-foreground/5"
                >
                  {addressCopied ? <Check size={14} /> : <Copy size={14} />}
                  {addressCopied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Current value
                </p>
                {accountMode === "demo" && (
                  <button
                    type="button"
                    onClick={() => setDemoDepositOpen(true)}
                    className="border border-amber-500/50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    + Deposit tokens
                  </button>
                )}
              </div>
              <h1 className="text-6xl font-bold font-pixel tracking-tight text-foreground lg:text-7xl">
                {currentValueUsd != null
                  ? `$${formatUsd(currentValueUsd, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "—"}
              </h1>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  {isDemoView ? "P&L baseline" : "Total deposited"}
                </p>
                <p
                  className="text-lg font-mono font-bold"
                  title={portfolio ? baselineDepositHint(portfolio) : undefined}
                >
                  {baselineUsd != null ? `$${formatUsd(baselineUsd)}` : "—"}
                </p>
                {portfolio && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {baselineDepositHint(portfolio)}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Net earned
                </p>
                <p
                  className={`text-lg font-mono font-bold ${
                    netEarnedUsd != null && netEarnedUsd < 0
                      ? "text-red-600"
                      : "text-[#ea580c]"
                  }`}
                >
                  {netEarnedUsd != null
                    ? `$${formatUsd(netEarnedUsd, { maximumFractionDigits: 2 })}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Portfolio APR
                </p>
                <p className="text-lg font-mono font-bold">{aprLine}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  Since activation · 24h annualized
                </p>
              </div>
            </div>
          </motion.div>
        )}

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
            {strategy && poolsLoading ? (
              <PoolMetricsStripSkeleton tiles={Object.keys(strategy.poolAllocations).filter((id) => strategy.poolAllocations[id] > 0).length || 3} />
            ) : strategy ? (
            <PoolMetricsStrip
              poolAllocations={strategy.poolAllocations}
              pools={pools}
              loading={poolsLoading}
              accountMode={viewMode}
            />
            ) : null}

            {!strategy || strategyLoading ? (
              <ActivePoolsPanelSkeleton />
            ) : (
            <>
            <div className="flex flex-wrap items-center justify-between gap-4 border border-border px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  Agent status
                </p>
                <AgentStatusBadge status={agentDisplayStatus} />
                {socketConnected && (
                  <span className="font-mono text-[10px] text-[#16a34a]">
                    {isDemoView ? "fork" : "live"}
                  </span>
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

            {tradingStatus?.demoWalletNotice && (
              <p className="border border-amber-500/30 bg-amber-500/5 px-4 py-3 font-mono text-xs text-amber-700 dark:text-amber-400">
                {tradingStatus.demoWalletNotice}
                {!tradingStatus.demoTradingAvailable &&
                  " — Anvil fork is offline; demo cycles are paused."}
                {tradingStatus.demoCycleBusy &&
                  " — A demo cycle is running; yours will queue."}
              </p>
            )}

            {tradingStatus?.lastError && (
              <p className="border border-[#ea580c]/30 bg-[#ea580c]/5 px-4 py-3 font-mono text-xs text-[#ea580c]">
                {tradingStatus.lastError}
              </p>
            )}

            {!isDemoView &&
              tradingStatus?.lastCycle?.somniaAttestation?.txHash && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Somnia attestation:{" "}
                <span className="text-foreground">
                  request #{tradingStatus.lastCycle.somniaAttestation.requestId ?? "—"}
                </span>
              </p>
            )}
            {isDemoView && tradingStatus?.lastCycle && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Last cycle: demo fork
                {tradingStatus.lastCycle.accountMode && (
                  <> · {tradingStatus.lastCycle.accountMode}</>
                )}
                {tradingStatus.lastCycle.executedTransactions.length > 0 &&
                  " · swaps run on local Anvil"}
              </p>
            )}
            {tradingStatus?.lastCycle?.llmResponse && (
              <div className="border border-border px-4 py-4">
                <p className="mb-1 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                  OpenAI summary
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {tradingStatus.lastCycle.llmResponse}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ActivePoolsPanel pools={activePoolRows} />
              <LastTradeCard trade={lastTrade} accountMode={viewMode} />
            </div>

            <div className="border border-border p-6">
              <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                Active sub-agents
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {enabledSubAgents.map((agent) => (
                  <div key={agent.id}>
                    <p className="font-mono text-sm text-foreground">{agent.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {agent.systemPrompt}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border p-6">
              <p className="mb-2 text-xs font-mono tracking-widest uppercase text-muted-foreground">
                {isDemoView
                  ? "Demo wallet (simulation)"
                  : "Your agent wallet (mainnet)"}
              </p>
              <p className="mb-4 font-mono text-[10px] text-muted-foreground">
                {isDemoView
                  ? `Fork balances for ${displayWalletAddress ?? "the shared demo wallet"} on the Anvil fork. Pre-seeded for paper trading — no real deposit required.`
                  : "Live balances on Somnia mainnet for tokens in your selected pools. The agent signs and submits swaps automatically — you never approve transactions in a wallet."}
              </p>
              {displayWalletAddress && (
                <code className="mb-4 block break-all font-mono text-[10px] text-muted-foreground">
                  {displayWalletAddress}
                </code>
              )}
              <WalletBalancesList
                balances={balances}
                loading={balancesLoading}
                error={balancesError}
                emptyLabel={
                  isDemoView
                    ? "No fork balances yet — run npm run fork:anvil or activate your agent to auto-fund"
                    : "No supported tokens in active pools"
                }
              />
            </div>
            </>
            )}
            </div>
          )}

          {activeTab === "markets" && (
            <div className="space-y-6">
              <p className="font-mono text-xs text-muted-foreground">
                {isDemoView
                  ? "QuickSwap pool catalog (mainnet reference). Your demo agent trades the same pools on the Anvil fork."
                  : "Live QuickSwap pools on Somnia mainnet — allocation from your agent strategy."}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                Pool APY reflects on-chain fee yield per pool — not your portfolio APR
                (see overview metrics).
              </p>

              {poolsError && (
                <p className="font-mono text-xs text-[#ea580c]">{poolsError}</p>
              )}

              {poolsLoading || strategyLoading || !strategy ? (
                <MarketsTableSkeleton rows={4} />
              ) : marketRows.length === 0 ? (
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
                    <div className="hidden border-b border-border bg-muted/20 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:grid lg:grid-cols-8 lg:gap-4">
                      <div className="col-span-2">Pool</div>
                      <div>TVL</div>
                      <div>Volume</div>
                      <div>Liquidity</div>
                      <div>APY</div>
                      <div>Allocated</div>
                      <div>Value</div>
                    </div>
                    {marketRows.map((market) => (
                      <div
                        key={market.id}
                        className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border p-4 last:border-b-0 lg:grid-cols-8 lg:items-center"
                      >
                        <div className="col-span-2 flex items-start gap-2 font-mono text-sm">
                          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${market.color}`} />
                          <div>
                            <p className="text-foreground">{market.name}</p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {market.pair}
                            </p>
                            {market.priceHint && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {market.priceHint}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">TVL </span>
                          {market.tvlUsd}
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">Volume </span>
                          {market.volumeUsd}
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">Liquidity </span>
                          {market.liquidity}
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">APY </span>
                          {market.apy}
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">Allocated </span>
                          {market.allocated.toFixed(1)}%
                        </div>
                        <div className="font-mono text-sm text-foreground">
                          <span className="text-muted-foreground lg:hidden">Value </span>$
                          {market.value.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
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
                  {isDemoView
                    ? "Your demo agent network trades on the Anvil fork (paper trading)."
                    : "Your agent network is active on Somnia mainnet."}
                </p>
                <Link
                  href={APP_ROUTES.agentCanvas}
                  className="shrink-0 border border-[#ea580c] px-4 py-2 font-mono text-xs uppercase tracking-widest text-[#ea580c] transition-colors hover:bg-[#ea580c]/10"
                >
                  {isDemoView ? "View demo agents" : "View live agents"}
                </Link>
              </div>
              <ul className="space-y-2 font-mono text-sm text-foreground">
                <li>• Rebalance across QuickSwap liquidity pools</li>
                <li>
                  • Swap via Algebra V4 on{" "}
                  {isDemoView ? "the Anvil fork (demo)" : "Somnia mainnet"}
                </li>
                <li>• Monitor pool prices and migrate capital</li>
                <li>• Execute moves with Somnia LLM inference agent</li>
              </ul>
              <p className="font-mono text-xs text-muted-foreground">
                {isDemoView
                  ? "Open the demo canvas to watch root and sub-agents move between pool nodes on the fork."
                  : "Open the live canvas to watch root and sub-agents move between pool nodes in real time."}
              </p>
            </div>
          )}
        </div>
      </main>

      <DemoDepositModal
        open={demoDepositOpen}
        walletAddress={displayWalletAddress}
        onClose={() => setDemoDepositOpen(false)}
        onDeposited={() => {
          void reloadPortfolio()
          void reloadBalances()
        }}
      />
    </>
  )
}
