"use client"

import Link from "next/link"
import type { LastTradeInfo } from "@/lib/trading-helpers"
import { tradingHistoryFilterHref } from "@/lib/trading-helpers"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import { MarketplaceTxLink } from "@/components/trading/marketplace-tx-link"
import { SomniaAttestationTxLink } from "@/components/trading/somnia-attestation-tx-link"
import { formatSttWei } from "@/lib/marketplace-display"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_TRADES = 5

type RecentTradesCardProps = {
  trades: LastTradeInfo[]
  accountMode?: LastTradeInfo["accountMode"]
  loading?: boolean
}

function executionBadge(trade: LastTradeInfo) {
  if (trade.executionKind === "attestation") {
    return (
      <span className="rounded border border-cyan-500/30 bg-cyan-500/5 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-cyan-500">
        Somnia attestation
      </span>
    )
  }
  if (trade.executionKind === "marketplace") {
    return (
      <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
        Marketplace · x402
      </span>
    )
  }
  return (
    <span className="rounded border border-[#ea580c]/30 bg-[#ea580c]/5 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[#ea580c]">
      Executor
    </span>
  )
}

export function RecentTradesCard({
  trades,
  accountMode,
  loading = false,
}: RecentTradesCardProps) {
  const mode = trades[0]?.accountMode ?? accountMode ?? null
  const visible = trades.slice(0, MAX_VISIBLE_TRADES)

  return (
    <div className="flex h-full min-h-[220px] flex-col border border-border p-6">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Recent activity
          {mode === "demo" && (
            <span className="ml-2 text-[10px] text-amber-600">(demo fork)</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={tradingHistoryFilterHref("executor")}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Executor
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link
            href={tradingHistoryFilterHref("marketplace")}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Marketplace
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link
            href={APP_ROUTES.tradingHistory}
            className="font-mono text-[10px] uppercase tracking-widest text-[#ea580c] hover:text-[#ff7a2a]"
          >
            All history
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-muted-foreground">Loading activity…</p>
      ) : visible.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No executor swaps or marketplace purchases yet. Activity appears when
          agents run cycles or buy x402 data.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {visible.map((trade, index) => (
            <div
              key={
                trade.txHash ??
                `${trade.executionKind}-${trade.label}-${trade.at}-${index}`
              }
              className="border border-border/80 bg-muted/10 px-3 py-2 font-mono text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm text-foreground">{trade.label}</p>
                {executionBadge(trade)}
              </div>
              {trade.executionKind === "marketplace" && trade.amountSttWei ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Paid {formatSttWei(trade.amountSttWei)}
                </p>
              ) : (trade.amountIn || trade.amountOut) ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {trade.amountIn ?? "?"} → {trade.amountOut ?? "?"}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {new Date(trade.at).toLocaleString()} ·{" "}
                <span
                  className={cn(
                    trade.status === "success"
                      ? "text-[#16a34a]"
                      : "text-[#ea580c]",
                  )}
                >
                  {trade.status}
                </span>
              </p>
              {trade.executionKind === "marketplace" && trade.txHash ? (
                <div className="mt-1">
                  <MarketplaceTxLink txHash={trade.txHash} />
                </div>
              ) : trade.executionKind === "attestation" && trade.txHash ? (
                <div className="mt-1">
                  <SomniaAttestationTxLink txHash={trade.txHash} />
                </div>
              ) : trade.txHash ? (
                <div className="mt-1">
                  <TxHashDisplay txHash={trade.txHash} accountMode={mode} />
                </div>
              ) : trade.executionKind === "marketplace" ? (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  Dev bypass — no on-chain tx
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
