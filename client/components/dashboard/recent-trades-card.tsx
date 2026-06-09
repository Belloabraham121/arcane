"use client"

import Link from "next/link"
import type { LastTradeInfo } from "@/lib/trading-helpers"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import { APP_ROUTES } from "@/lib/routing/app-routes"

const MAX_VISIBLE_TRADES = 5

type RecentTradesCardProps = {
  trades: LastTradeInfo[]
  accountMode?: LastTradeInfo["accountMode"]
  loading?: boolean
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
          Recent trades
          {mode === "demo" && (
            <span className="ml-2 text-[10px] text-amber-600">(demo fork)</span>
          )}
        </p>
        <Link
          href={APP_ROUTES.tradingHistory}
          className="font-mono text-[10px] uppercase tracking-widest text-[#ea580c] hover:text-[#ff7a2a]"
        >
          Full history
        </Link>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-muted-foreground">Loading trades…</p>
      ) : visible.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No swaps or rebalances recorded yet. The agent will trade when a cycle
          runs and signals a move.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {visible.map((trade, index) => (
            <div
              key={trade.txHash ?? `${trade.label}-${trade.at}-${index}`}
              className="border border-border/80 bg-muted/10 px-3 py-2 font-mono text-xs"
            >
              <p className="truncate text-sm text-foreground">{trade.label}</p>
              {(trade.amountIn || trade.amountOut) && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {trade.amountIn ?? "?"} → {trade.amountOut ?? "?"}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {new Date(trade.at).toLocaleString()} ·{" "}
                <span
                  className={
                    trade.status === "success"
                      ? "text-[#16a34a]"
                      : "text-[#ea580c]"
                  }
                >
                  {trade.status}
                </span>
              </p>
              {trade.txHash ? (
                <div className="mt-1">
                  <TxHashDisplay txHash={trade.txHash} accountMode={mode} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
