"use client"

import type { LiveTradingFeedItem } from "@/lib/api/trading-socket-types"
import { somniaTxUrl } from "@/lib/somnia-explorer"
import { cn } from "@/lib/utils"

type LiveTradingFeedProps = {
  items: LiveTradingFeedItem[]
  connected?: boolean
  className?: string
}

export function LiveTradingFeed({
  items,
  connected = false,
  className,
}: LiveTradingFeedProps) {
  return (
    <aside className={cn("flex w-full flex-col font-mono text-xs", className)}>
      <p className="border-b border-border px-3 py-2 text-[10px] text-muted-foreground">
        Live agent activity
        <span
          className={cn(
            "ml-2 inline-flex items-center gap-1",
            connected ? "text-[#16a34a]" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "animate-pulse bg-[#16a34a]" : "bg-muted-foreground",
            )}
          />
          {connected ? "connected" : "offline"}
        </span>
      </p>

      <div className="max-h-[min(50vh,360px)] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-muted-foreground">
            Waiting for trading cycles. Events appear here in real time when the
            agent analyzes pools or executes swaps.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="border-b border-border px-3 py-2.5 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground">{item.headline}</span>
                <span
                  className={cn(
                    "text-[10px] uppercase",
                    item.status === "success" || item.status === "completed"
                      ? "text-[#16a34a]"
                      : item.status === "running"
                        ? "text-[#ea580c]"
                        : "text-muted-foreground",
                  )}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                {item.detail}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(item.at).toLocaleTimeString()}
              </p>
              {item.txHash && (
                <a
                  href={somniaTxUrl(item.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[10px] text-[#ea580c] hover:underline"
                >
                  {item.txHash.slice(0, 10)}… ↗
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
