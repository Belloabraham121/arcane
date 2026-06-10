"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown, ChevronRight, Search } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { AccountModeBadge } from "@/components/layout/account-mode-badge"
import { PageSubBar } from "@/components/layout/page-sub-bar"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useSession } from "@/providers/session-provider"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type TradingActionRecord,
  type TradingHistoryListItem,
} from "@/lib/api/trading"
import {
  fetchMarketplacePurchases,
  type MarketplacePurchaseRecord,
} from "@/lib/api/marketplace"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"
import { MarketplaceReceiptPanel } from "@/components/marketplace/marketplace-receipt-panel"
import { MarketplaceX402SpendChart } from "@/components/marketplace/marketplace-x402-spend-chart"
import { formatSttWei, marketplaceProductLabel } from "@/lib/marketplace-display"
import { summarizeMarketplaceSpend } from "@/lib/marketplace-spend-chart"
import { MarketplaceTxLink } from "@/components/trading/marketplace-tx-link"
import { SomniaAttestationTxLink } from "@/components/trading/somnia-attestation-tx-link"
import { SomniaAttestationPanel } from "@/components/trading/somnia-attestation-panel"
import { somniaTxUrl } from "@/lib/somnia-explorer"
import {
  attestationFromActionMetadata,
  isSomniaAttestationAction,
} from "@/lib/somnia-attestation"
import { cn } from "@/lib/utils"

const TX_PAGE_SIZE = 10
const HISTORY_FETCH_SIZE = 50

type FlatTx = TradingActionRecord & {
  cycleId: string
  cycleReason: string
  cycleMessage: string
  accountMode: "demo" | "live"
}

type ExplorerEntry = {
  id: string
  kind: "action" | "marketplace"
  createdAt: string
  action?: FlatTx
  purchase?: MarketplacePurchaseRecord
}

/* ─── helpers ──────────────────────────────────────────────── */

function poolLabel(poolId: string | null): string {
  if (!poolId) return "—"
  return POOL_LABELS[poolId] ?? poolId
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—"
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function agentLabel(tx: FlatTx): string {
  if (tx.type === "sub_agent") {
    const m = tx.metadata as Record<string, unknown> | null
    return typeof m?.agentName === "string" ? m.agentName : "Sub-agent"
  }
  return "Executor Agent"
}

function methodLabel(tx: FlatTx): string {
  if (isSomniaAttestationAction(tx)) return "Somnia LLM Attestation"
  if (tx.type === "swap") return "Swap"
  if (tx.type === "rebalance") return "Rebalance"
  if (tx.type === "approve") return "Approve"
  if (tx.type === "quote") return "Quote"
  if (tx.type === "sub_agent") return "Analysis"
  if (tx.type === "tool") return tx.toolName ?? "Tool Call"
  return tx.type
}

function typeIcon(tx: FlatTx): string {
  if (isSomniaAttestationAction(tx)) return "⛓"
  const type = tx.type
  if (type === "swap" || type === "rebalance") return "↔"
  if (type === "approve") return "✓"
  if (type === "sub_agent") return "◈"
  if (type === "quote") return "≈"
  return "⚙"
}

function typeColor(tx: FlatTx): string {
  if (isSomniaAttestationAction(tx)) return "text-cyan-400"
  switch (tx.type) {
    case "swap":
    case "rebalance":
      return "text-[#ea580c]"
    case "approve":
      return "text-blue-400"
    case "sub_agent":
      return "text-violet-400"
    case "quote":
      return "text-amber-400"
    default:
      return "text-muted-foreground"
  }
}

function statusPill(status: string) {
  const s = status.toLowerCase()
  const color =
    s === "success"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
      : s === "failed" || s === "reverted"
        ? "bg-red-500/15 text-red-400 border-red-500/20"
        : "bg-muted text-muted-foreground border-border"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest",
        color,
      )}
    >
      {s === "success" ? "Success" : s === "failed" ? "Failed" : s === "reverted" ? "Reverted" : s}
    </span>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/* ─── detail panel for a single expanded tx ────────────────── */

function marketplaceMetadata(
  purchase: MarketplacePurchaseRecord,
): Record<string, unknown> | null {
  if (!purchase.metadata || typeof purchase.metadata !== "object") {
    return null
  }
  return purchase.metadata as Record<string, unknown>
}

function MarketplaceDetailPanel({
  purchase,
}: {
  purchase: MarketplacePurchaseRecord
}) {
  const meta = marketplaceMetadata(purchase)
  const productData =
    meta?.productData && typeof meta.productData === "object"
      ? (meta.productData as Record<string, unknown>)
      : null

  return (
    <div className="border-t border-border/50 bg-muted/10 px-5 py-4">
      <MarketplaceReceiptPanel
        receipt={{
          productId: purchase.productId,
          amountSttWei: purchase.amountSttWei,
          txHash: purchase.txHash,
          status: purchase.status,
          agentId: purchase.subAgentId ?? undefined,
          agentName:
            typeof meta?.subAgentName === "string"
              ? meta.subAgentName
              : undefined,
          devBypass: !purchase.txHash && purchase.status === "success",
          error: typeof meta?.error === "string" ? meta.error : null,
          productData,
          payerAddress: purchase.payerAddress,
          correlationId: purchase.correlationId,
          createdAt: purchase.createdAt,
        }}
      />
    </div>
  )
}

function TxDetailPanel({ tx }: { tx: FlatTx }) {
  const meta = tx.metadata as Record<string, unknown> | null
  const isDemo = tx.accountMode === "demo"
  const isSubAgent = tx.type === "sub_agent"
  const isAttestation = isSomniaAttestationAction(tx)
  const attestation = attestationFromActionMetadata(tx)

  return (
    <div className="border-t border-border/50 bg-muted/10 px-5 py-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Transaction Hash */}
        <DetailRow label="Transaction Hash">
          {tx.txHash ? (
            isAttestation ? (
              <div className="space-y-1">
                <SomniaAttestationTxLink txHash={tx.txHash} />
                <code className="block break-all text-[10px] text-muted-foreground">
                  {tx.txHash}
                </code>
              </div>
            ) : isDemo ? (
              <code className="break-all text-[10px] text-muted-foreground">
                {tx.txHash}
              </code>
            ) : (
              <a
                href={somniaTxUrl(tx.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[10px] text-[#ea580c] hover:underline"
              >
                {tx.txHash}
              </a>
            )
          ) : (
            <span className="text-[10px] text-muted-foreground/40">
              No on-chain tx {isSubAgent && "(read-only analysis)"}
            </span>
          )}
        </DetailRow>

        {/* Status */}
        <DetailRow label="Status">
          {statusPill(tx.status)}
        </DetailRow>

        {/* Timestamp */}
        <DetailRow label="Timestamp">
          <span className="text-[10px]">
            {new Date(tx.createdAt).toLocaleString()}
          </span>
        </DetailRow>

        {/* Agent */}
        <DetailRow label="Agent">
          <span className={cn("text-[10px]", tx.type === "sub_agent" ? "text-violet-400" : "text-[#ea580c]")}>
            {agentLabel(tx)}
          </span>
        </DetailRow>

        {/* Method / Tool */}
        <DetailRow label="Method">
          <span className={cn("text-[10px] font-semibold", typeColor(tx))}>
            {methodLabel(tx)}
          </span>
          {tx.toolName && tx.type !== "sub_agent" && !isAttestation && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {tx.toolName}
            </span>
          )}
        </DetailRow>

        {/* Cycle Reason */}
        <DetailRow label="Cycle Trigger">
          <span className="text-[10px] capitalize">{tx.cycleReason}</span>
        </DetailRow>
      </div>

      {/* Token/Pool details */}
      {(tx.tokenIn || tx.tokenOut || tx.poolFrom || tx.poolTo) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tx.tokenIn && (
            <DetailRow label="Token In">
              <code className="break-all text-[10px] text-foreground">{tx.tokenIn}</code>
              {tx.amountIn && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  ({tx.amountIn})
                </span>
              )}
            </DetailRow>
          )}
          {tx.tokenOut && (
            <DetailRow label="Token Out">
              <code className="break-all text-[10px] text-foreground">{tx.tokenOut}</code>
              {tx.amountOut && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  ({tx.amountOut})
                </span>
              )}
            </DetailRow>
          )}
          {tx.poolFrom && (
            <DetailRow label="From Pool">
              <span className="text-[10px]">{poolLabel(tx.poolFrom)}</span>
              <code className="ml-2 text-[9px] text-muted-foreground">{tx.poolFrom}</code>
            </DetailRow>
          )}
          {tx.poolTo && (
            <DetailRow label="To Pool">
              <span className="text-[10px]">{poolLabel(tx.poolTo)}</span>
              <code className="ml-2 text-[9px] text-muted-foreground">{tx.poolTo}</code>
            </DetailRow>
          )}
        </div>
      )}

      {/* Somnia LLM attestation */}
      {isAttestation && attestation ? (
        <SomniaAttestationPanel attestation={attestation} compact />
      ) : null}

      {/* Sub-agent thought / summary */}
      {isSubAgent && meta?.summary && (
        <div className="rounded border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
          <p className="mb-1 text-[9px] uppercase tracking-widest text-violet-400">
            Agent Analysis
          </p>
          <p className="text-xs leading-relaxed text-foreground/80">
            {String(meta.summary)}
          </p>
          {typeof meta.durationMs === "number" && (
            <p className="mt-1 text-[9px] text-muted-foreground">
              Completed in {meta.durationMs}ms
            </p>
          )}
        </div>
      )}

      {/* Raw metadata / tool output */}
      {meta && Object.keys(meta).length > 0 && (
        <MetadataAccordion meta={meta} />
      )}

      {isDemo && (
        <p className="text-[9px] text-amber-600 dark:text-amber-400">
          Demo transaction — not on Somnia mainnet.
        </p>
      )}
    </div>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

function MetadataAccordion({ meta }: { meta: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded border border-border/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Raw Data
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-border/50 bg-background px-3 py-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  )
}

/* ─── skeleton ─────────────────────────────────────────────── */

function SkeletonTxRows() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted-foreground/10" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-48 animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-2.5 w-32 animate-pulse rounded bg-muted-foreground/10" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/10" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted-foreground/10" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted-foreground/10" />
        </div>
      ))}
    </div>
  )
}

/* ─── activity chart ───────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {
  "Executor Agent": "#ea580c",
  "Signal Scout": "#8b5cf6",
  "Risk Manager": "#06b6d4",
  "Yield Executor": "#22c55e",
  "Sub-agent": "#a78bfa",
}

const TOOL_COLORS: Record<string, string> = {
  swap: "#ea580c",
  rebalance: "#f59e0b",
  approve: "#3b82f6",
  quote: "#eab308",
  sub_agent: "#8b5cf6",
  tool: "#6b7280",
}

function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? "#a78bfa"
}

function toolColor(name: string): string {
  return TOOL_COLORS[name] ?? "#6b7280"
}

type ActivityBarDatum = { name: string; calls: number; fill: string }

function buildAgentChartData(txs: FlatTx[]): ActivityBarDatum[] {
  const counts = new Map<string, number>()
  for (const tx of txs) {
    const name = agentLabel(tx)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, calls]) => ({ name, calls, fill: agentColor(name) }))
}

function buildToolChartData(txs: FlatTx[]): ActivityBarDatum[] {
  const counts = new Map<string, number>()
  for (const tx of txs) {
    const label = tx.type === "tool" ? (tx.toolName ?? "tool") : tx.type
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, calls]) => ({ name, calls, fill: toolColor(name) }))
}

function buildChartConfig(data: ActivityBarDatum[]): ChartConfig {
  const cfg: ChartConfig = {}
  for (const d of data) {
    cfg[d.name] = { label: d.name, color: d.fill }
  }
  cfg.calls = { label: "Calls" }
  return cfg
}

function ActivityCharts({ txs }: { txs: FlatTx[] }) {
  const agentData = useMemo(() => buildAgentChartData(txs), [txs])
  const toolData = useMemo(() => buildToolChartData(txs), [txs])
  const agentConfig = useMemo(() => buildChartConfig(agentData), [agentData])
  const toolConfig = useMemo(() => buildChartConfig(toolData), [toolData])

  if (txs.length === 0) return null

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Agent call frequency */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/20 px-4 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Agent Call Frequency
          </p>
        </div>
        <div className="px-4 py-4">
          <ChartContainer config={agentConfig} className="aspect-auto h-[200px] w-full">
            <BarChart
              data={agentData}
              layout="vertical"
              margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={110}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={<ChartTooltipContent hideIndicator />}
              />
              <Bar dataKey="calls" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>

      {/* Tool/action type frequency */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/20 px-4 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Action Type Frequency
          </p>
        </div>
        <div className="px-4 py-4">
          <ChartContainer config={toolConfig} className="aspect-auto h-[200px] w-full">
            <BarChart
              data={toolData}
              layout="vertical"
              margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={110}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={<ChartTooltipContent hideIndicator />}
              />
              <Bar dataKey="calls" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  )
}

/* ─── main page ────────────────────────────────────────────── */

export default function ExplorerPage() {
  const router = useRouter()
  const { sessionReady, accountMode, demoWalletAddress, tradingWalletAddress } =
    useSession()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<ExplorerEntry[]>([])
  const [marketplacePurchases, setMarketplacePurchases] = useState<
    MarketplacePurchaseRecord[]
  >([])
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const mode = accountMode ?? "demo"
  const walletAddr =
    mode === "demo" ? demoWalletAddress : tradingWalletAddress

  const load = useCallback(async () => {
    setLoading(true)
    const allItems: TradingHistoryListItem[] = []
    let historyPage = 1
    let historyTotalPages = 1

    while (historyPage <= historyTotalPages) {
      const historyResult = await fetchTradingHistory(
        historyPage,
        HISTORY_FETCH_SIZE,
        mode,
      )
      if (!historyResult.success || !historyResult.data?.items.length) break
      allItems.push(...historyResult.data.items)
      historyTotalPages = historyResult.meta?.pagination?.totalPages ?? 1
      historyPage++
    }

    const detailResults = await Promise.all(
      allItems
        .filter((row) => row.actionCount > 0)
        .map((row) => fetchTradingCycleDetail(row.id)),
    )

    const merged: ExplorerEntry[] = []

    for (const result of detailResults) {
      if (!result.success || !result.data?.cycle) continue
      const cycle = result.data.cycle
      for (const action of cycle.actions) {
        const flat: FlatTx = {
          ...action,
          cycleId: cycle.id,
          cycleReason: cycle.reason,
          cycleMessage: cycle.message,
          accountMode: cycle.accountMode,
        }
        merged.push({
          id: `action-${flat.id}`,
          kind: "action",
          createdAt: flat.createdAt,
          action: flat,
        })
      }

      const hasAttestationAction = cycle.actions.some((action) =>
        isSomniaAttestationAction(action),
      )
      if (cycle.somniaAttestation?.txHash && !hasAttestationAction) {
        const att = cycle.somniaAttestation
        const syntheticId = `attestation-${cycle.id}`
        const flat: FlatTx = {
          id: syntheticId,
          cycleId: cycle.id,
          cycleReason: cycle.reason,
          cycleMessage: cycle.message,
          accountMode: cycle.accountMode,
          type: "tool",
          toolName: "somnia_attestation",
          txHash: att.txHash,
          status: att.status === "failed" ? "failed" : "success",
          createdAt: cycle.finishedAt ?? cycle.startedAt,
          tokenIn: null,
          tokenOut: null,
          amountIn: null,
          amountOut: null,
          poolFrom: null,
          poolTo: null,
          metadata: att as unknown as Record<string, unknown>,
        }
        merged.push({
          id: `action-${syntheticId}`,
          kind: "action",
          createdAt: flat.createdAt,
          action: flat,
        })
      }
    }

    const purchasesResult = await fetchMarketplacePurchases(100)
    const purchases = purchasesResult.success
      ? (purchasesResult.data?.purchases ?? [])
      : []
    setMarketplacePurchases(purchases)
    for (const purchase of purchases) {
      merged.push({
        id: `marketplace-${purchase.id}`,
        kind: "marketplace",
        createdAt: purchase.createdAt,
        purchase,
      })
    }

    merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    setEntries(merged)
    setLoading(false)
  }, [mode])

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
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter((entry) => {
      if (entry.kind === "marketplace" && entry.purchase) {
        const p = entry.purchase
        return (
          p.productId.toLowerCase().includes(q) ||
          p.txHash?.toLowerCase().includes(q) ||
          p.payerAddress.toLowerCase().includes(q) ||
          p.correlationId.toLowerCase().includes(q) ||
          q.includes("marketplace") ||
          q.includes("x402") ||
          q.includes("stt")
        )
      }
      const t = entry.action
      if (!t) return false
      return (
        t.txHash?.toLowerCase().includes(q) ||
        t.tokenIn?.toLowerCase().includes(q) ||
        t.tokenOut?.toLowerCase().includes(q) ||
        t.poolFrom?.toLowerCase().includes(q) ||
        t.poolTo?.toLowerCase().includes(q) ||
        t.toolName?.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        agentLabel(t).toLowerCase().includes(q) ||
        methodLabel(t).toLowerCase().includes(q) ||
        q.includes("attestation") ||
        q.includes("somnia")
      )
    })
  }, [entries, search])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / TX_PAGE_SIZE)),
    [filtered.length],
  )

  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * TX_PAGE_SIZE
    return filtered.slice(start, start + TX_PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
  }

  const txCount = filtered.length
  const pageStart = filtered.length === 0 ? 0 : (page - 1) * TX_PAGE_SIZE + 1
  const pageEnd = Math.min(page * TX_PAGE_SIZE, filtered.length)
  const swapCount = filtered.filter(
    (e) =>
      e.kind === "action" &&
      (e.action?.type === "swap" || e.action?.type === "rebalance"),
  ).length
  const subAgentCount = filtered.filter(
    (e) => e.kind === "action" && e.action?.type === "sub_agent",
  ).length
  const marketplaceCount = filtered.filter((e) => e.kind === "marketplace").length
  const spend24h = summarizeMarketplaceSpend(marketplacePurchases, "24h")

  return (
    <>
      <PageSubBar
        title="Agent Explorer"
        badge={<AccountModeBadge mode={mode} />}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={APP_ROUTES.agentCanvas}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Canvas
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

      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* ─── Hero Search ─── */}
        <div className="border-b border-border py-8">
          <h1 className="mb-1 font-mono text-lg text-foreground">
            Arcane Agent Explorer
          </h1>
          <p className="mb-5 font-mono text-xs text-muted-foreground">
            {mode === "demo" ? "Demo" : "Somnia Mainnet"} ·{" "}
            Inspect agent & sub-agent transactions
          </p>
          <form onSubmit={handleSearch} className="relative max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by tx hash, address, token, pool, agent…"
              className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-24 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#ea580c]/40"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-[#ea580c] px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white transition-colors hover:bg-[#ea580c]/80"
            >
              Search
            </button>
          </form>
          {walletAddr && !search && (
            <button
              type="button"
              onClick={() => setSearch(walletAddr)}
              className="mt-3 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Search your agent wallet:{" "}
              <span className="text-[#ea580c]">{shortAddr(walletAddr)}</span>
            </button>
          )}
        </div>

        {/* ─── Stats row ─── */}
        <div className="flex items-center gap-6 border-b border-border py-4">
          <Stat label="Transactions" value={txCount} />
          <Stat label="Swaps" value={swapCount} />
          <Stat label="Analyses" value={subAgentCount} />
          <Stat label="Marketplace" value={marketplaceCount} />
          <Stat
            label="x402 · 24h"
            value={formatSttWei(spend24h.totalSpendWei)}
            text
          />
          <Stat
            label="Network"
            value={mode === "demo" ? "Demo" : "Somnia"}
            text
          />
        </div>

        {/* ─── Activity Charts ─── */}
        {!loading && (
          <ActivityCharts
            txs={filtered
              .filter((e) => e.kind === "action" && e.action)
              .map((e) => e.action!)}
          />
        )}

        {/* ─── Marketplace x402 spend (full width) ─── */}
        {!loading && (
          <MarketplaceX402SpendChart
            purchases={marketplacePurchases}
            className="mt-6 w-full"
          />
        )}

        {/* ─── Transaction list ─── */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Latest Transactions
            </p>
            {totalPages > 1 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                Page {page}/{totalPages}
              </span>
            )}
          </div>

          {loading ? (
            <SkeletonTxRows />
          ) : filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="font-mono text-sm text-muted-foreground">
                {search
                  ? "No transactions match your search."
                  : "No agent transactions yet."}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                {search
                  ? "Try a different address, tx hash, or keyword."
                  : "Run a trading cycle from the dashboard to see activity here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {paginatedEntries.map((entry) => {
                const uid = entry.id
                const isExpanded = expandedId === uid

                if (entry.kind === "marketplace" && entry.purchase) {
                  const purchase = entry.purchase
                  return (
                    <div key={uid}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : uid)
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00ff88]/10 text-sm text-[#00ff88]">
                          ◆
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#00ff88]">
                              Marketplace · x402
                            </span>
                            <span className="rounded bg-[#00ff88]/10 px-1.5 py-0.5 text-[9px] text-[#00ff88]">
                              {marketplaceProductLabel(purchase.productId)}
                            </span>
                            {purchase.txHash && (
                              <code className="truncate text-[10px] text-muted-foreground">
                                {shortAddr(purchase.txHash)}
                              </code>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            Paid {formatSttWei(purchase.amountSttWei)} · STT
                          </div>
                          {purchase.txHash ? (
                            <div className="mt-1">
                              <MarketplaceTxLink txHash={purchase.txHash} />
                            </div>
                          ) : null}
                        </div>
                        <div className="hidden shrink-0 sm:block">
                          {statusPill("success")}
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {timeAgo(purchase.createdAt)}
                        </span>
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90",
                          )}
                        />
                      </button>
                      {isExpanded && (
                        <MarketplaceDetailPanel purchase={purchase} />
                      )}
                    </div>
                  )
                }

                const tx = entry.action
                if (!tx) return null
                const isAttestation = isSomniaAttestationAction(tx)

                return (
                  <div key={uid}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : uid)
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm",
                          isAttestation
                            ? "bg-cyan-500/10 text-cyan-400"
                            : tx.type === "swap" || tx.type === "rebalance"
                              ? "bg-[#ea580c]/10 text-[#ea580c]"
                              : tx.type === "approve"
                                ? "bg-blue-500/10 text-blue-400"
                                : tx.type === "sub_agent"
                                  ? "bg-violet-500/10 text-violet-400"
                                  : tx.type === "quote"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-muted text-muted-foreground",
                        )}
                      >
                        {typeIcon(tx)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              typeColor(tx),
                            )}
                          >
                            {methodLabel(tx)}
                          </span>
                          {tx.txHash && (
                            <code className="truncate text-[10px] text-muted-foreground">
                              {shortAddr(tx.txHash)}
                            </code>
                          )}
                          {tx.toolName &&
                            tx.type !== "sub_agent" &&
                            !isAttestation && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                {tx.toolName}
                              </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span
                            className={
                              isAttestation
                                ? "text-cyan-400/70"
                                : tx.type === "sub_agent"
                                  ? "text-violet-400/70"
                                  : "text-[#ea580c]/70"
                            }
                          >
                            {isAttestation ? "On-chain LLM proof" : agentLabel(tx)}
                          </span>
                          {!isAttestation && (tx.tokenIn || tx.poolFrom) && (
                            <>
                              <span>·</span>
                              <span>
                                {tx.tokenIn
                                  ? shortAddr(tx.tokenIn)
                                  : poolLabel(tx.poolFrom)}
                              </span>
                              <span>→</span>
                              <span>
                                {tx.tokenOut
                                  ? shortAddr(tx.tokenOut)
                                  : poolLabel(tx.poolTo)}
                              </span>
                            </>
                          )}
                        </div>
                        {isAttestation && tx.txHash ? (
                          <div className="mt-1">
                            <SomniaAttestationTxLink txHash={tx.txHash} />
                          </div>
                        ) : null}
                      </div>

                      <div className="hidden shrink-0 sm:block">
                        {statusPill(tx.status)}
                      </div>

                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {timeAgo(tx.createdAt)}
                      </span>

                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </button>

                    {isExpanded && <TxDetailPanel tx={tx} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Pagination ─── */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between pb-6">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              ← Previous
            </button>
            <span className="font-mono text-[10px] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border py-4">
          <p className="font-mono text-[10px] text-muted-foreground/50">
            {filtered.length > 0
              ? `Showing ${pageStart}–${pageEnd} of ${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}`
              : "No transactions"}{" "}
            from {mode === "demo" ? "demo mode" : "Somnia Mainnet"}.
            {search && ` Filtered by "${search}".`}
          </p>
        </div>
      </div>
    </>
  )
}

/* ─── small stat chip ──────────────────────────────────────── */

function Stat({
  label,
  value,
  text,
}: {
  label: string
  value: number | string
  text?: boolean
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-sm",
          text ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
}
