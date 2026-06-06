"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { getMe } from "@/lib/api/auth"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type TradingHistoryDetail,
  type TradingHistoryListItem,
  type TradingHistoryPagination,
} from "@/lib/api/trading"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import { somniaTxUrl } from "@/lib/somnia-explorer"
import {
  formatReason,
  lastTradeFromHistoryDetail,
} from "@/lib/trading-helpers"
import { POOL_LABELS } from "@/lib/strategy-presets"

const PAGE_SIZE = 15

function poolLabel(poolId: string | null): string {
  if (!poolId) {
    return "—"
  }
  return POOL_LABELS[poolId] ?? poolId
}

function CycleDetailPanel({ detail }: { detail: TradingHistoryDetail }) {
  const lastTrade = lastTradeFromHistoryDetail(detail)

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
      {(detail.llmSummary || detail.llmResponse) && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            LLM reasoning
          </p>
          <p className="font-mono text-xs text-foreground whitespace-pre-wrap">
            {detail.llmSummary ?? detail.llmResponse}
          </p>
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
          <a
            href={somniaTxUrl(lastTrade.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-mono text-xs text-[#ea580c] hover:underline"
          >
            View on Somnia explorer ↗
          </a>
        </div>
      )}

      {detail.actions.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Actions ({detail.actions.length})
          </p>
          <div className="space-y-2">
            {detail.actions.map((action) => (
              <div
                key={action.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px]"
              >
                <span className="uppercase text-foreground">
                  {action.type}
                  {action.toolName ? ` · ${action.toolName}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {action.poolFrom || action.poolTo
                    ? `${poolLabel(action.poolFrom)} → ${poolLabel(action.poolTo)}`
                    : action.tokenIn && action.tokenOut
                      ? `${action.tokenIn} → ${action.tokenOut}`
                      : ""}
                </span>
                <span
                  className={
                    action.status === "success"
                      ? "text-[#16a34a]"
                      : "text-[#ea580c]"
                  }
                >
                  {action.status}
                </span>
                {action.txHash && (
                  <a
                    href={somniaTxUrl(action.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ea580c] hover:underline"
                  >
                    {action.txHash.slice(0, 8)}… ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TradingHistoryPage() {
  const router = useRouter()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
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

  const loadPage = useCallback(async (nextPage: number) => {
    setError(null)
    const result = await fetchTradingHistory(nextPage, PAGE_SIZE)
    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to load trading history")
      return
    }
    setItems(result.data.items)
    setPagination(result.meta?.pagination ?? null)
    setPage(nextPage)
  }, [])

  useEffect(() => {
    async function init() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }

      const meResult = await getMe()
      if (meResult.success && meResult.data?.user.walletAddress) {
        setWalletAddress(meResult.data.user.walletAddress)
      }

      await loadPage(1)
      setLoading(false)
    }

    init()
  }, [router, loadPage])

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
        <p className="font-mono text-xs text-muted-foreground">
          Loading trading history…
        </p>
      </div>
    )
  }

  const totalPages = pagination?.totalPages ?? 1

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <AppNavBar walletAddress={walletAddress} />

      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                Trading history
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                Cycles, LLM reasoning, and on-chain actions on Somnia mainnet
              </p>
            </div>
            <Link
              href={APP_ROUTES.dashboard}
              className="font-mono text-xs uppercase tracking-widest text-[#ea580c] hover:text-[#ff7a2a]"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        {error && (
          <p className="mb-6 font-mono text-xs text-[#ea580c]">{error}</p>
        )}

        {items.length === 0 ? (
          <div className="border border-border p-8 text-center">
            <p className="font-mono text-sm text-muted-foreground">
              No trading cycles recorded yet.
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Activate your agent and deposit funds — cycles run on activation,
              schedule, or deposit detection.
            </p>
          </div>
        ) : (
          <div className="border border-border">
            {items.map((cycle) => {
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
                        {cycle.llmPending && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            LLM pending
                          </span>
                        )}
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
    </div>
  )
}
