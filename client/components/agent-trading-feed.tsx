"use client"

import { TxHashDisplay } from "@/components/trading/tx-hash-display"
import type { AccountMode } from "@/lib/api/auth"
import type { LiveTradingFeedItem } from "@/lib/api/trading-socket-types"
import { cn } from "@/lib/utils"

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

export function AgentTradingFeed({
  accountMode,
  items,
  connected = false,
  cycleActive = false,
  onViewAgentResponse,
  className,
}: AgentTradingFeedProps) {
  const isDemo = accountMode === "demo"
  const title = isDemo ? "Demo agent activity" : "Live agent activity"
  const railLabel = isDemo ? "fork" : "live"
  const connectedColor = isDemo ? "text-amber-600 dark:text-amber-400" : "text-[#16a34a]"
  const connectedDot = isDemo ? "bg-amber-500" : "bg-[#16a34a]"

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

      <div className="max-h-[min(50vh,360px)] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-muted-foreground">
            {isDemo
              ? "Cycles run automatically on the Anvil fork. Open this canvas to watch swaps live."
              : "Cycles run automatically on mainnet. Events appear here when the agent trades."}
          </p>
        ) : (
          items.map((item) => {
            const showAgentButton =
              onViewAgentResponse != null && isCycleSummaryItem(item)

            return (
              <div
                key={item.id}
                className="border-b border-border px-3 py-2.5 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground">{item.headline}</span>
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
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
