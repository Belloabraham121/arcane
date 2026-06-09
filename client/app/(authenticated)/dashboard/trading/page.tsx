"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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
  const isDemo = detail.accountMode === "demo"

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
      {isDemo && (
        <p className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
          Anvil fork transaction — not on Somnia mainnet.
        </p>
      )}

      {!isDemo && detail.somniaAttestation?.txHash && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Somnia on-chain agent (attestation)
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {detail.somniaAttestation.message}
          </p>
          {detail.somniaAttestation.requestId && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Request #{detail.somniaAttestation.requestId}
            </p>
          )}
          <a
            href={somniaTxUrl(detail.somniaAttestation.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-mono text-xs text-[#ea580c] hover:underline"
          >
            View Somnia attestation tx ↗
          </a>
        </div>
      )}

      {(detail.llmSummary || detail.llmResponse) && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            OpenAI reasoning
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
  const { sessionReady, accountMode } = useSession()
  const historyMode = accountMode ?? undefined
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
            ? "Demo fork cycles only — separate from live mainnet transactions"
            : "Live mainnet cycles only — demo fork transactions are listed separately"
        }
        badge={accountMode ? <AccountModeBadge mode={accountMode} /> : undefined}
        backHref={APP_ROUTES.dashboard}
        backLabel="Back to dashboard"
      />

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        {error && (
          <p className="mb-6 font-mono text-xs text-[#ea580c]">{error}</p>
        )}

        {loading ? (
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
                        {cycle.accountMode && (
                          <AccountModeBadge mode={cycle.accountMode} />
                        )}
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
    </>
  )
}
