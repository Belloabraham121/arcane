"use client"

import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import type { AccountMode } from "@/lib/api/auth"
import type { ExecutedTransaction } from "@/lib/api/trading"
import {
  executionDetail,
  executionHeadline,
  type AgentCycleOutcome,
} from "@/lib/agent-cycle-outcome"
import { cn } from "@/lib/utils"

type AgentCycleExecutionPanelProps = {
  accountMode: AccountMode
  outcome: AgentCycleOutcome | null
  cycleActive: boolean
  executedTransactions?: ExecutedTransaction[]
  onViewAgentResponse?: () => void
}

export function AgentCycleExecutionPanel({
  accountMode,
  outcome,
  cycleActive,
  executedTransactions = [],
  onViewAgentResponse,
}: AgentCycleExecutionPanelProps) {
  const isDemo = accountMode === "demo"
  const active = cycleActive || outcome?.status === "running"

  const display = active
    ? outcome ?? {
        cycleId: "pending",
        status: "running" as const,
        executedCount: 0,
        message: "Agent is analyzing pools and portfolio…",
        llmResponse: null,
        finishedAt: null,
        reason: null,
      }
    : outcome

  if (!display) {
    return (
      <div className="space-y-2 font-mono text-[10px] text-muted-foreground">
        <p>No cycle has run yet for this mode.</p>
        <p>
          Active strategies trade automatically in the background. Open this
          canvas to watch swaps animate the orange agent between pool nodes.
        </p>
      </div>
    )
  }

  const headline = executionHeadline(display, isDemo)
  const detail = executionDetail(display)
  const swapsExecuted = display.executedCount > 0

  return (
    <div className="space-y-3 font-mono text-[10px]">
      <div
        className={cn(
          "rounded border px-3 py-2",
          active
            ? isDemo
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : "border-[#ea580c]/40 bg-[#ea580c]/10 text-[#ea580c]"
            : display.status === "failed"
              ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
              : swapsExecuted
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "border-border bg-muted/30 text-muted-foreground",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="uppercase tracking-widest">{headline}</span>
          {active ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
          ) : display.finishedAt ? (
            <span className="text-[9px] opacity-80">
              {new Date(display.finishedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 leading-relaxed">{detail}</p>
        {!active && onViewAgentResponse ? (
          <button
            type="button"
            onClick={onViewAgentResponse}
            className="mt-2 text-[10px] uppercase tracking-widest text-[#ea580c] hover:underline"
          >
            View full agent response
          </button>
        ) : null}
      </div>

      {!active && !swapsExecuted && display.llmResponse ? (
        <div className="max-h-24 overflow-y-auto rounded border border-border bg-background/50 px-2 py-1.5 text-muted-foreground">
          <p className="mb-1 uppercase tracking-widest text-[9px]">Agent summary</p>
          <p className="line-clamp-4 whitespace-pre-wrap">{display.llmResponse}</p>
        </div>
      ) : null}

      {executedTransactions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="uppercase tracking-widest text-muted-foreground">
            Executed transactions
          </p>
          {executedTransactions.map((tx) => (
            <div
              key={tx.hash}
              className="flex items-center justify-between gap-2 border border-border px-2 py-1"
            >
              <span className="uppercase text-foreground">{tx.kind}</span>
              <TxHashDisplay
                txHash={tx.hash}
                accountMode={accountMode}
                className="text-[#ea580c] hover:underline"
              />
            </div>
          ))}
        </div>
      ) : null}

      {active ? (
        <p className="text-muted-foreground">
          {swapsExecuted
            ? "Swaps will appear here and animate the agent between pools."
            : "When the LLM executes a swap, the orange agent moves pool → pool."}
        </p>
      ) : null}
    </div>
  )
}
