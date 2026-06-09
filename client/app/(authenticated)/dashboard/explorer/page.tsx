"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"
import { AccountModeBadge } from "@/components/layout/account-mode-badge"
import { PageSubBar } from "@/components/layout/page-sub-bar"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import { useSession } from "@/providers/session-provider"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type TradingActionRecord,
  type TradingHistoryDetail,
  type TradingHistoryListItem,
} from "@/lib/api/trading"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30

type FlatAction = TradingActionRecord & {
  cycleId: string
  cycleReason: string
  accountMode: "demo" | "live"
}

function poolLabel(poolId: string | null): string {
  if (!poolId) return "—"
  return POOL_LABELS[poolId] ?? `${poolId.slice(0, 6)}…${poolId.slice(-4)}`
}

function actionAgent(action: FlatAction): string {
  if (action.type === "sub_agent") {
    const meta = action.metadata as Record<string, unknown> | null
    return typeof meta?.agentName === "string" ? meta.agentName : "Sub-agent"
  }
  return "Root Agent"
}

function actionReason(action: FlatAction): string {
  if (action.type === "sub_agent") {
    const meta = action.metadata as Record<string, unknown> | null
    return typeof meta?.summary === "string"
      ? meta.summary
      : "Analyzed portfolio"
  }
  if (action.type === "swap" || action.type === "rebalance") {
    const from = poolLabel(action.poolFrom)
    const to = poolLabel(action.poolTo)
    if (action.poolFrom && action.poolTo) return `Rebalance ${from} → ${to}`
    return `Swap executed`
  }
  if (action.type === "approve") return "Token approval for swap router"
  if (action.type === "quote") return "Quote simulation"
  return action.type
}

function typeColor(type: string): string {
  switch (type) {
    case "swap":
    case "rebalance":
      return "text-[#ea580c]"
    case "approve":
      return "text-blue-500"
    case "sub_agent":
      return "text-violet-500"
    case "quote":
      return "text-muted-foreground"
    default:
      return "text-muted-foreground"
  }
}

function statusBadge(status: string) {
  const color =
    status === "success"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "failed" || status === "reverted"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground"

  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[8px] uppercase tracking-widest",
        color,
      )}
    >
      {status}
    </span>
  )
}

function shortAddr(addr: string | null): string {
  if (!addr) return "—"
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 animate-pulse rounded bg-muted-foreground/10" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export default function ExplorerPage() {
  const router = useRouter()
  const { sessionReady, accountMode } = useSession()
  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState<FlatAction[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const mode = accountMode ?? "demo"

  const load = useCallback(async () => {
    setLoading(true)
    const historyResult = await fetchTradingHistory(page, PAGE_SIZE, mode)
    if (!historyResult.success || !historyResult.data?.items.length) {
      setActions([])
      setTotalPages(1)
      setLoading(false)
      return
    }

    if (historyResult.meta?.pagination) {
      setTotalPages(historyResult.meta.pagination.totalPages)
    }

    const items = historyResult.data.items
    const detailResults = await Promise.all(
      items
        .filter((row) => row.actionCount > 0)
        .map((row) => fetchTradingCycleDetail(row.id)),
    )

    const flat: FlatAction[] = []

    for (const result of detailResults) {
      if (!result.success || !result.data?.cycle) continue
      const cycle = result.data.cycle
      for (const action of cycle.actions) {
        flat.push({
          ...action,
          cycleId: cycle.id,
          cycleReason: cycle.reason,
          accountMode: cycle.accountMode,
        })
      }
    }

    for (const item of items) {
      if (item.actionCount === 0) {
        flat.push({
          id: `cycle-${item.id}`,
          type: "tool",
          toolName: "cycle_no_action",
          tokenIn: null,
          tokenOut: null,
          amountIn: null,
          amountOut: null,
          poolFrom: null,
          poolTo: null,
          txHash: null,
          status: item.status === "failed" ? "failed" : "success",
          metadata: { message: item.message },
          createdAt: item.finishedAt,
          cycleId: item.id,
          cycleReason: item.reason,
          accountMode: item.accountMode,
        })
      }
    }

    flat.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    setActions(flat)
    setLoading(false)
  }, [page, mode])

  useEffect(() => {
    if (!sessionReady) return
    async function init() {
      const route = await resolvePostAuthRoute()
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route)
        return
      }
      void load()
    }
    void init()
  }, [sessionReady, load, router])

  const filtered = useMemo(() => {
    if (!search.trim()) return actions
    const q = search.toLowerCase()
    return actions.filter(
      (a) =>
        a.type.toLowerCase().includes(q) ||
        a.txHash?.toLowerCase().includes(q) ||
        a.toolName?.toLowerCase().includes(q) ||
        a.tokenIn?.toLowerCase().includes(q) ||
        a.tokenOut?.toLowerCase().includes(q) ||
        a.poolFrom?.toLowerCase().includes(q) ||
        a.poolTo?.toLowerCase().includes(q) ||
        actionAgent(a).toLowerCase().includes(q) ||
        actionReason(a).toLowerCase().includes(q),
    )
  }, [actions, search])

  return (
    <>
      <PageSubBar
        title="Agent Explorer"
        badge={
          <AccountModeBadge mode={mode} />
        }
        action={
          <div className="flex items-center gap-3">
            <Link
              href={APP_ROUTES.agentCanvas}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Agent canvas
            </Link>
            <Link
              href={APP_ROUTES.dashboard}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-12">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tx hash, token, pool, agent name, action type…"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#ea580c]/40"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[9px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2.5 text-left">Time</th>
                <th className="px-3 py-2.5 text-left">Agent</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">From</th>
                <th className="px-3 py-2.5 text-left">To</th>
                <th className="px-3 py-2.5 text-left">Tx Hash</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-muted-foreground"
                  >
                    {search
                      ? "No transactions match your search."
                      : "No agent transactions yet. Run a trading cycle to see activity."}
                  </td>
                </tr>
              ) : (
                filtered.map((action) => (
                  <tr
                    key={`${action.cycleId}-${action.id}`}
                    className="border-b border-border transition-colors hover:bg-muted/20"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {new Date(action.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={
                          action.type === "sub_agent"
                            ? "text-violet-500"
                            : "text-[#ea580c]"
                        }
                      >
                        {actionAgent(action)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={typeColor(action.type)}>
                        {action.type === "sub_agent"
                          ? "analysis"
                          : action.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {action.tokenIn
                        ? shortAddr(action.tokenIn)
                        : poolLabel(action.poolFrom)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {action.tokenOut
                        ? shortAddr(action.tokenOut)
                        : poolLabel(action.poolTo)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {action.txHash ? (
                        <TxHashDisplay
                          txHash={action.txHash}
                          accountMode={action.accountMode}
                          className="text-[#ea580c] hover:underline"
                        />
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {statusBadge(action.status)}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2.5 text-muted-foreground">
                      {actionReason(action)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              Previous
            </button>
            <span className="font-mono text-[10px] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}

        <p className="mt-6 font-mono text-[10px] text-muted-foreground/60">
          Showing {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} from{" "}
          {mode === "demo" ? "Anvil fork" : "Somnia mainnet"}.
          {search && ` Filtered by "${search}".`}
        </p>
      </div>
    </>
  )
}
