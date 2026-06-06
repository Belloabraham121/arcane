"use client"

import Link from "next/link"
import type { LastTradeInfo } from "@/lib/trading-helpers"
import { somniaTxUrl } from "@/lib/somnia-explorer"
import { APP_ROUTES } from "@/lib/routing/app-routes"

type LastTradeCardProps = {
  trade: LastTradeInfo | null
}

export function LastTradeCard({ trade }: LastTradeCardProps) {
  return (
    <div className="border border-border p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Last trade
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
            <a
              href={somniaTxUrl(trade.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[#ea580c] hover:underline"
            >
              {trade.txHash.slice(0, 10)}…{trade.txHash.slice(-6)} ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
