"use client"

import { useState } from "react"
import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import type { AccountMode } from "@/lib/api/auth"
import type { LiveTradingFeedItem } from "@/lib/api/trading-socket-types"
import { cn } from "@/lib/utils"

type FeedFilter = "all" | "trades" | "sub-agents"

type AgentTradingFeedProps = {
  accountMode: AccountMode
  items: LiveTradingFeedItem[]
  connected?: boolean
  cycleActive?: boolean
  onViewAgentResponse?: (item: LiveTradingFeedItem) => void
  className?: string
}

function isCycleSummaryItem(item: LiveTradingFeedItem): boolean {
  return (
    item.headline.startsWith("Cycle ") ||
    Boolean(item.cycleId && item.llmResponse != null)
  )
}

function isSubAgentItem(item: LiveTradingFeedItem): boolean {
  return item.subAgent != null
}

function isTradeItem(item: LiveTradingFeedItem): boolean {
  return !isSubAgentItem(item)
}

function SubAgentThoughtView({
  item,
}: {
  item: LiveTradingFeedItem
}) {
  const [expanded, setExpanded] = useState(false)
  const sa = item.subAgent
  if (!sa) return null

  return (
    <div className="mt-1.5 space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#ea580c] hover:underline"
      >
        {expanded ? "▾ Hide thoughts" : "▸ View thoughts"}
      </button>
      {expanded && (
        <div className="space-y-1.5 rounded border border-border bg-background/80 p-2">
          <div>
            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">
              Summary
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[10px] leading-relaxed text-foreground">
              {sa.summary}
            </p>
          </div>
          {sa.data && Object.keys(sa.data).length > 0 && (
            <div>
              <p className="text-[8px] uppercase tracking-widest text-muted-foreground">
                Structured data (JSON)
              </p>
              <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-muted/50 p-1.5 text-[9px] leading-tight text-foreground">
                {JSON.stringify(sa.data, null, 2)}
              </pre>
            </div>
          )}
          {sa.durationMs != null && (
            <p className="text-[8px] text-muted-foreground">
              Completed in {sa.durationMs}ms
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const SUB_AGENT_DOT_COLORS: Record<string, string> = {
  "signal-scout": "#3b82f6",
  "risk-manager": "#f59e0b",
  "yield-executor": "#22c55e",
  "bridge-scout": "#8b5cf6",
}

export function AgentTradingFeed({
  accountMode,
  items,
  connected = false,
  cycleActive = false,
  onViewAgentResponse,
  className,
}: AgentTradingFeedProps) {
  const isDemo = accountMode === "demo"
  const [filter, setFilter] = useState<FeedFilter>("all")
  const title = isDemo ? "Demo agent activity" : "Live agent activity"
  const railLabel = isDemo ? "fork" : "live"
  const connectedColor = isDemo ? "text-amber-600 dark:text-amber-400" : "text-[#16a34a]"
  const connectedDot = isDemo ? "bg-amber-500" : "bg-[#16a34a]"

  const filteredItems = items.filter((item) => {
    if (filter === "trades") return isTradeItem(item)
    if (filter === "sub-agents") return isSubAgentItem(item)
    return true
  })

  const subAgentCount = items.filter(isSubAgentItem).length
  const tradeCount = items.filter(isTradeItem).length

  return (
    <aside className={cn("flex w-full flex-col font-mono text-xs", className)}>
      <p
        className={cn(
          "border-b border-border px-3 py-2 text-[10px]",
          isDemo ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {title}
        {cycleActive ? (
          <span className="ml-2 uppercase text-[#ea580c]">· executing</span>
        ) : (
          <span className="ml-2 text-muted-foreground">· auto</span>
        )}
        <span
          className={cn(
            "ml-2 inline-flex items-center gap-1",
            connected ? connectedColor : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? `animate-pulse ${connectedDot}` : "bg-muted-foreground",
            )}
          />
          {connected ? `${railLabel} · connected` : "offline"}
        </span>
      </p>

      <div className="flex border-b border-border">
        {(
          [
            { key: "all", label: "All", count: items.length },
            { key: "trades", label: "Trades", count: tradeCount },
            { key: "sub-agents", label: "Sub-agents", count: subAgentCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              "flex-1 px-2 py-1.5 text-[9px] uppercase tracking-widest transition-colors",
              filter === tab.key
                ? "border-b-2 border-[#ea580c] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-muted-foreground/60">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[min(50vh,360px)] overflow-y-auto">
        {filteredItems.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-muted-foreground">
            {filter === "sub-agents"
              ? "No sub-agent activity yet. Sub-agents analyze portfolios at the start of each cycle."
              : filter === "trades"
                ? "No trade activity yet. Trades appear when the agent executes swaps."
                : isDemo
                  ? "Cycles run automatically on the Anvil fork. Open this canvas to watch swaps live."
                  : "Cycles run automatically on mainnet. Events appear here when the agent trades."}
          </p>
        ) : (
          filteredItems.map((item) => {
            const showAgentButton =
              onViewAgentResponse != null && isCycleSummaryItem(item)
            const isSubAgent = isSubAgentItem(item)
            const dotColor = isSubAgent
              ? SUB_AGENT_DOT_COLORS[item.subAgent?.agentId ?? ""] ?? "#6366f1"
              : undefined

            return (
              <div
                key={item.id}
                className="border-b border-border px-3 py-2.5 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isSubAgent && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          item.status === "running" && "animate-pulse",
                        )}
                        style={{ backgroundColor: dotColor }}
                      />
                    )}
                    <span className="text-foreground">{item.headline}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {showAgentButton ? (
                      <button
                        type="button"
                        onClick={() => onViewAgentResponse(item)}
                        className="text-[10px] uppercase tracking-widest text-[#ea580c] hover:underline"
                      >
                        View agent
                      </button>
                    ) : null}
                    <span
                      className={cn(
                        "text-[10px] uppercase",
                        item.status === "success" || item.status === "completed"
                          ? "text-[#16a34a]"
                          : item.status === "running"
                            ? isDemo
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-[#ea580c]"
                            : "text-muted-foreground",
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                  {item.detail}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(item.at).toLocaleTimeString()}
                </p>
                {item.txHash && (
                  <div className="mt-1">
                    <TxHashDisplay
                      txHash={item.txHash}
                      accountMode={accountMode}
                      className="inline-block font-mono text-[10px] text-[#ea580c] hover:underline"
                    />
                  </div>
                )}
                {isSubAgent && item.status === "completed" && (
                  <SubAgentThoughtView item={item} />
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
