"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MarkdownContent } from "@/components/agent/markdown-content"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import {
  fetchTradingCycleDetail,
  type TradingHistoryDetail,
} from "@/lib/api/trading"
import { SOMNIA_LLM_FULL_RESPONSE_LABEL } from "@/lib/somnia-llm"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { formatReason } from "@/lib/trading-helpers"

function poolLabel(poolId: string | null): string {
  if (!poolId) {
    return "—"
  }
  return POOL_LABELS[poolId] ?? poolId
}

type AgentLlmResponseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cycleId: string | null
  /** Inline text when already available (socket / status). */
  initialText?: string | null
  headline?: string
}

function CycleActionsList({ detail }: { detail: TradingHistoryDetail }) {
  const actions = detail.actions.filter(
    (row) =>
      row.type === "swap" ||
      row.type === "rebalance" ||
      row.type === "approve",
  )

  if (actions.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No on-chain actions recorded for this cycle.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {actions.map((action) => {
        const label =
          action.type === "rebalance" && action.poolFrom && action.poolTo
            ? `${poolLabel(action.poolFrom)} → ${poolLabel(action.poolTo)}`
            : action.tokenIn && action.tokenOut
              ? `${action.tokenIn} → ${action.tokenOut}`
              : action.type

        return (
          <li
            key={action.id}
            className="rounded border border-border bg-background/50 px-3 py-2 font-mono text-[11px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-widest text-foreground">
                {action.type}
              </span>
              <span className="text-muted-foreground">
                {new Date(action.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-foreground">{label}</p>
            {(action.amountIn || action.amountOut) && (
              <p className="mt-0.5 text-muted-foreground">
                {action.amountIn ?? "?"} → {action.amountOut ?? "?"}
              </p>
            )}
            {action.txHash ? (
              <div className="mt-1">
                <TxHashDisplay
                  txHash={action.txHash}
                  accountMode={detail.accountMode}
                  className="text-[#ea580c] hover:underline"
                />
              </div>
            ) : null}
            <p className="mt-1 text-[10px] text-muted-foreground">
              Status: {action.status}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function AgentLlmResponseDialog({
  open,
  onOpenChange,
  cycleId,
  initialText,
  headline = "Agent response",
}: AgentLlmResponseDialogProps) {
  const [text, setText] = useState(initialText ?? "")
  const [detail, setDetail] = useState<TradingHistoryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    if (initialText?.trim()) {
      setText(initialText)
    }

    if (!cycleId) {
      if (!initialText?.trim()) {
        setText("")
        setError("No agent response available for this cycle.")
      }
      setDetail(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchTradingCycleDetail(cycleId).then((result) => {
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.success && result.data?.cycle) {
        const cycle = result.data.cycle
        setDetail(cycle)
        setText(
          cycle.llmResponse ?? cycle.llmSummary ?? cycle.message ?? initialText ?? "",
        )
        return
      }
      setDetail(null)
      if (!initialText?.trim()) {
        setError(result.error?.message ?? "Failed to load agent response")
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, cycleId, initialText])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden font-mono">
        <DialogHeader>
          <DialogTitle className="text-base">{headline}</DialogTitle>
          <DialogDescription className="text-[10px] uppercase tracking-widest">
            {SOMNIA_LLM_FULL_RESPONSE_LABEL} for this trading cycle
            {detail ? ` · ${formatReason(detail.reason)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading agent response…</p>
          ) : error ? (
            <p className="text-xs text-[#ea580c]">{error}</p>
          ) : text.trim() ? (
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Summary
              </p>
              <div className="rounded border border-border bg-muted/20 px-4 py-3">
                <MarkdownContent content={text} />
              </div>
            </section>
          ) : (
            <p className="text-xs text-muted-foreground">
              No written response for this cycle.
            </p>
          )}

          {detail && detail.poolDrift.length > 0 ? (
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Pool drift at cycle time
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.poolDrift.map((row) => (
                  <div
                    key={row.poolId}
                    className="flex justify-between rounded border border-border px-2 py-1.5 text-[10px] text-muted-foreground"
                  >
                    <span>{row.label}</span>
                    <span>
                      {row.currentPercent.toFixed(1)}% / target{" "}
                      {row.targetPercent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {detail ? (
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Transactions this cycle
              </p>
              <CycleActionsList detail={detail} />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
