"use client"

import Link from "next/link"
import type { LastTradeInfo } from "@/lib/trading-helpers"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import { APP_ROUTES } from "@/lib/routing/app-routes"

type LastTradeCardProps = {
  trade: LastTradeInfo | null
  accountMode?: LastTradeInfo["accountMode"]
}

export function LastTradeCard({ trade, accountMode }: LastTradeCardProps) {
  const mode = trade?.accountMode ?? accountMode ?? null

  return (
    <div className="border border-border p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Last trade
          {mode === "demo" && (
            <span className="ml-2 text-[10px] text-amber-600">(demo)</span>
          )}
        </p>
        <Link
          href={APP_ROUTES.tradingHistory}
          className="font-mono text-[10px] uppercase tracking-widest text-[#ea580c] hover:text-[#ff7a2a]"
        >
          Full history
        </Link>
      </div>

      {!trade ? (
        <p className="font-mono text-xs text-muted-foreground">
          No swaps or rebalances recorded yet. The agent will trade when a cycle
          runs and drift or LLM signals a move.
        </p>
      ) : (
        <div className="space-y-2 font-mono text-xs">
          <p className="text-sm text-foreground">{trade.label}</p>
          {(trade.amountIn || trade.amountOut) && (
            <p className="text-muted-foreground">
              {trade.amountIn ?? "?"} → {trade.amountOut ?? "?"}
            </p>
          )}
          <p className="text-muted-foreground">
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
          {trade.txHash && (
            <TxHashDisplay txHash={trade.txHash} accountMode={mode} />
          )}
          {mode === "demo" && trade.txHash && (
            <p className="text-[10px] text-muted-foreground">
              Demo transaction — not on Somnia explorer.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
