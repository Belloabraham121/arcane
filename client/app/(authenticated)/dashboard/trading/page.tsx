"use client"

import Link from "next/link"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AccountModeBadge } from "@/components/layout/account-mode-badge"
import { PageSubBar } from "@/components/layout/page-sub-bar"
import { TradingHistoryTableSkeleton } from "@/components/skeletons/content-skeletons"
import { useSession } from "@/providers/session-provider"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type TradingHistoryDetail,
  type TradingHistoryListItem,
  type TradingHistoryPagination,
} from "@/lib/api/trading"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import { MarkdownContent } from "@/components/agent/markdown-content"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import { MarketplaceTxLink } from "@/components/trading/marketplace-tx-link"
import { SomniaAttestationTxLink } from "@/components/trading/somnia-attestation-tx-link"
import { SomniaAttestationPanel } from "@/components/trading/somnia-attestation-panel"
import { somniaTxUrl } from "@/lib/somnia-explorer"
import {
  attestationFromActionMetadata,
  isSomniaAttestationAction,
} from "@/lib/somnia-attestation"
import {
  cycleMatchesExecutionFilter,
  formatReason,
  lastTradeFromHistoryDetail,
  type HistoryExecutionFilter,
} from "@/lib/trading-helpers"
import { cn } from "@/lib/utils"
import { POOL_LABELS } from "@/lib/strategy-presets"
import {
  MarketplaceReceiptPanel,
  type MarketplaceReceiptData,
} from "@/components/marketplace/marketplace-receipt-panel"
import { formatSttWei, marketplaceProductLabel } from "@/lib/marketplace-display"
import type { TradingActionRecord } from "@/lib/api/trading"

const PAGE_SIZE = 15
const EXECUTION_FILTERS: HistoryExecutionFilter[] = [
  "all",
  "executor",
  "marketplace",
]
const FILTER_LABELS: Record<HistoryExecutionFilter, string> = {
  all: "All",
  executor: "Executor",
  marketplace: "Marketplace · x402",
}

function parseExecutionFilter(raw: string | null): HistoryExecutionFilter {
  if (raw === "executor" || raw === "marketplace") {
    return raw
  }
  return "all"
}

function poolLabel(poolId: string | null): string {
  if (!poolId) {
    return "—"
  }
  return POOL_LABELS[poolId] ?? poolId
}

function marketplaceReceiptFromAction(
  action: TradingActionRecord,
): MarketplaceReceiptData | null {
  if (action.type !== "marketplace_purchase") {
    return null
  }
  const meta =
    action.metadata && typeof action.metadata === "object"
      ? (action.metadata as Record<string, unknown>)
      : null
  if (!meta) {
    return null
  }
  const productId =
    typeof meta.productId === "string"
      ? meta.productId
      : (action.toolName ?? "unknown")
  const amountSttWei =
    typeof meta.amountSttWei === "string" ? meta.amountSttWei : "0"
  return {
    productId,
    amountSttWei,
    txHash: action.txHash,
    status: action.status,
    agentId: typeof meta.agentId === "string" ? meta.agentId : undefined,
    agentName: typeof meta.agentName === "string" ? meta.agentName : undefined,
    devBypass: meta.devBypass === true,
    error: typeof meta.error === "string" ? meta.error : null,
    productData:
      meta.productData && typeof meta.productData === "object"
        ? (meta.productData as Record<string, unknown>)
        : null,
  }
}

function CycleDetailPanel({ detail }: { detail: TradingHistoryDetail }) {
  const lastTrade = lastTradeFromHistoryDetail(detail)
  const isDemo = detail.accountMode === "demo"

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
      {isDemo && (
        <p className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
          Demo transaction — not on Somnia mainnet.
        </p>
      )}

      {detail.somniaAttestation?.txHash && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Somnia on-chain LLM attestation
          </p>
          <SomniaAttestationPanel attestation={detail.somniaAttestation} compact />
        </div>
      )}

      {(detail.llmSummary || detail.llmResponse) && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Somnia LLM reasoning
          </p>
          <div className="rounded border border-border bg-background/50 px-3 py-2">
            <MarkdownContent content={detail.llmSummary ?? detail.llmResponse ?? ""} />
          </div>
        </div>
      )}

      {detail.poolDrift.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Pool drift at cycle time
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {detail.poolDrift.map((row) => (
              <div
                key={row.poolId}
                className="flex justify-between font-mono text-[10px] text-muted-foreground"
              >
                <span>{row.label}</span>
                <span>
                  {row.currentPercent.toFixed(1)}% / target{" "}
                  {row.targetPercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastTrade?.txHash && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Primary on-chain action
          </p>
          <p className="font-mono text-xs text-foreground">{lastTrade.label}</p>
          {isDemo ? (
            <code className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">
              {lastTrade.txHash}
            </code>
          ) : (
            <a
              href={somniaTxUrl(lastTrade.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-mono text-xs text-[#ea580c] hover:underline"
            >
              View on Somnia explorer ↗
            </a>
          )}
        </div>
      )}

      {detail.actions.some((a) => a.type === "marketplace_purchase") && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Marketplace data (x402 · STT)
          </p>
          <div className="space-y-3">
            {detail.actions
              .filter((action) => action.type === "marketplace_purchase")
              .map((action) => {
                const receipt = marketplaceReceiptFromAction(action)
                if (!receipt) {
                  return null
                }
                return (
                  <MarketplaceReceiptPanel
                    key={action.id}
                    receipt={receipt}
                    compact
                  />
                )
              })}
          </div>
        </div>
      )}

      {detail.actions.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Actions ({detail.actions.length})
          </p>
          <div className="space-y-2">
            {detail.actions.map((action) => {
              const marketplaceReceipt =
                action.type === "marketplace_purchase"
                  ? marketplaceReceiptFromAction(action)
                  : null
              const attestationReceipt = attestationFromActionMetadata(action)
              const isAttestation = isSomniaAttestationAction(action)

              return (
                <div
                  key={action.id}
                  className="border border-border bg-background px-3 py-2 font-mono text-[10px]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="uppercase text-foreground">
                      {isAttestation
                        ? "Somnia LLM attestation"
                        : action.type === "marketplace_purchase"
                          ? `marketplace · ${marketplaceProductLabel(
                              marketplaceReceipt?.productId ??
                                action.toolName ??
                                "",
                            )}`
                          : action.type}
                      {!isAttestation &&
                      action.type !== "marketplace_purchase" &&
                      action.toolName
                        ? ` · ${action.toolName}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {action.type === "marketplace_purchase" &&
                      marketplaceReceipt
                        ? formatSttWei(marketplaceReceipt.amountSttWei)
                        : action.poolFrom || action.poolTo
                          ? `${poolLabel(action.poolFrom)} → ${poolLabel(action.poolTo)}`
                          : action.tokenIn && action.tokenOut
                            ? `${action.tokenIn} → ${action.tokenOut}`
                            : ""}
                    </span>
                    <span
                      className={
                        action.status === "success"
                          ? action.type === "marketplace_purchase"
                            ? "text-[#00ff88]"
                            : "text-[#16a34a]"
                          : "text-[#ea580c]"
                      }
                    >
                      {action.status}
                    </span>
                    {action.txHash && isAttestation && (
                      <SomniaAttestationTxLink txHash={action.txHash} />
                    )}
                    {action.txHash && action.type === "marketplace_purchase" && (
                      <MarketplaceTxLink txHash={action.txHash} />
                    )}
                    {action.txHash &&
                      !isAttestation &&
                      action.type !== "marketplace_purchase" && (
                      <TxHashDisplay
                        txHash={action.txHash}
                        accountMode={detail.accountMode}
                        className="text-[#ea580c] hover:underline"
                      />
                    )}
                  </div>
                  {isAttestation && attestationReceipt ? (
                    <div className="mt-2 border-t border-border/50 pt-2">
                      <SomniaAttestationPanel
                        attestation={attestationReceipt}
                        compact
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TradingHistoryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sessionReady, accountMode } = useSession()
  const historyMode = accountMode ?? undefined
  const executionFilter = parseExecutionFilter(searchParams.get("filter"))
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<TradingHistoryListItem[]>([])
  const [pagination, setPagination] = useState<TradingHistoryPagination | null>(
    null,
  )
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, TradingHistoryDetail>>(
    {},
  )
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [filterLoading, setFilterLoading] = useState(false)

  const loadPage = useCallback(async (nextPage: number) => {
    setError(null)
    const result = await fetchTradingHistory(nextPage, PAGE_SIZE, historyMode)
    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to load trading history")
      return
    }
    setItems(result.data.items)
    setPagination(result.meta?.pagination ?? null)
    setPage(nextPage)
  }, [historyMode])

  useEffect(() => {
    if (!sessionReady) {
      return
    }

    async function init() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      await loadPage(1)
      setLoading(false)
    }

    void init()
  }, [router, loadPage, sessionReady])

  useEffect(() => {
    if (executionFilter === "all" || items.length === 0) {
      setFilterLoading(false)
      return
    }

    let cancelled = false

    async function hydrateForFilter() {
      setFilterLoading(true)
      const results = await Promise.all(
        items.map((item) => fetchTradingCycleDetail(item.id)),
      )
      if (cancelled) {
        return
      }
      setDetails((prev) => {
        const next = { ...prev }
        for (const result of results) {
          if (result.success && result.data?.cycle) {
            next[result.data.cycle.id] = result.data.cycle
          }
        }
        return next
      })
      setFilterLoading(false)
    }

    void hydrateForFilter()

    return () => {
      cancelled = true
    }
  }, [executionFilter, items])

  const visibleItems = useMemo(() => {
    if (executionFilter === "all") {
      return items
    }
    if (filterLoading) {
      return []
    }
    return items.filter((item) => {
      const detail = details[item.id]
      return (
        detail != null &&
        cycleMatchesExecutionFilter(detail, executionFilter)
      )
    })
  }, [items, details, executionFilter, filterLoading])

  function setExecutionFilter(next: HistoryExecutionFilter) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "all") {
      params.delete("filter")
    } else {
      params.set("filter", next)
    }
    const query = params.toString()
    router.replace(
      query ? `${APP_ROUTES.tradingHistory}?${query}` : APP_ROUTES.tradingHistory,
    )
  }

  async function toggleExpand(cycleId: string) {
    if (expandedId === cycleId) {
      setExpandedId(null)
      return
    }

    setExpandedId(cycleId)

    if (details[cycleId]) {
      return
    }

    setDetailLoading(cycleId)
    const result = await fetchTradingCycleDetail(cycleId)
    setDetailLoading(null)

    if (result.success && result.data?.cycle) {
      setDetails((prev) => ({ ...prev, [cycleId]: result.data!.cycle }))
    }
  }

  const totalPages = pagination?.totalPages ?? 1

  return (
    <>
      <PageSubBar
        title="Trading history"
        subtitle={
          accountMode === "demo"
            ? "Demo cycles only — separate from live mainnet transactions"
            : "Live mainnet cycles only — demo transactions are listed separately"
        }
        badge={accountMode ? <AccountModeBadge mode={accountMode} /> : undefined}
        backHref={APP_ROUTES.dashboard}
        backLabel="Back to dashboard"
      />

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {EXECUTION_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setExecutionFilter(filter)}
              className={cn(
                "rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                executionFilter === filter
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABELS[filter]}
            </button>
          ))}
          {filterLoading && executionFilter !== "all" ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              Filtering…
            </span>
          ) : null}
        </div>

        {error && (
          <p className="mb-6 font-mono text-xs text-[#ea580c]">{error}</p>
        )}

        {loading || (filterLoading && executionFilter !== "all") ? (
          <TradingHistoryTableSkeleton rows={8} />
        ) : items.length === 0 ? (
          <div className="border border-border p-8 text-center">
            <p className="font-mono text-sm text-muted-foreground">
              No trading cycles recorded yet.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Activate your agent and deposit funds — cycles run on activation,
              schedule, or deposit detection.
            </p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="border border-border p-8 text-center">
            <p className="font-mono text-sm text-muted-foreground">
              No cycles match the {FILTER_LABELS[executionFilter]} filter on this
              page.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Try another filter or go to the next page.
            </p>
          </div>
        ) : (
          <div className="border border-border">
            {visibleItems.map((cycle) => {
              const isOpen = expandedId === cycle.id
              const detail = details[cycle.id]
              return (
                <div key={cycle.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleExpand(cycle.id)}
                    className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs uppercase text-foreground">
                          {formatReason(cycle.reason)}
                        </span>
                        <span
                          className={`font-mono text-[10px] uppercase ${
                            cycle.status === "completed"
                              ? "text-[#16a34a]"
                              : "text-[#ea580c]"
                          }`}
                        >
                          {cycle.status}
                        </span>
                        {cycle.accountMode && (
                          <AccountModeBadge mode={cycle.accountMode} />
                        )}
                        {cycle.llmPending && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            LLM pending
                          </span>
                        )}
                        {details[cycle.id]?.actions.some(
                          (a) => a.type === "marketplace_purchase",
                        ) ? (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            x402
                          </span>
                        ) : null}
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {new Date(cycle.startedAt).toLocaleString()} →{" "}
                        {new Date(cycle.finishedAt).toLocaleString()} ·{" "}
                        {cycle.actionCount} action
                        {cycle.actionCount === 1 ? "" : "s"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground line-clamp-2">
                        {cycle.llmResponse ?? cycle.message}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {isOpen ? "Hide" : "Details"}
                    </span>
                  </button>

                  {isOpen && (
                    detailLoading === cycle.id ? (
                      <p className="border-t border-border px-4 py-4 font-mono text-xs text-muted-foreground">
                        Loading cycle detail…
                      </p>
                    ) : detail ? (
                      <CycleDetailPanel detail={detail} />
                    ) : (
                      <p className="border-t border-border px-4 py-4 font-mono text-xs text-[#ea580c]">
                        Could not load cycle detail.
                      </p>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between font-mono text-xs">
            <p className="text-muted-foreground">
              Page {page} of {totalPages} · {pagination.total} cycles
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => loadPage(page - 1)}
                className="border border-border px-3 py-1.5 uppercase tracking-widest disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => loadPage(page + 1)}
                className="border border-border px-3 py-1.5 uppercase tracking-widest disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export default function TradingHistoryPage() {
  return (
    <Suspense fallback={<TradingHistoryTableSkeleton rows={8} />}>
      <TradingHistoryContent />
    </Suspense>
  )
}
