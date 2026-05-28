"use client"

import { cn } from "@/lib/utils"


export type TradeEvent = {
  id: string
  timestamp: number
  type: "buy_signal" | "sell_signal" | "win" | "loss"
  agentAddress: string
  protocol: string
  signalName: string
  amount: number
  pnl: number
}

const PROTOCOLS = ["Uniswap", "AAVE", "Compound", "Lido", "Marketplace"]
const SIGNALS = ["Alpha Momentum", "Liquidity Sweep", "Volatility Break", "Yield Arb", "Delta Neutral"]

function randomAddress() {
  const hex = "0123456789abcdef"
  let addr = "0x"
  for (let i = 0; i < 40; i++) addr += hex[Math.floor(Math.random() * 16)]
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function createRandomTrade(): TradeEvent {
  const types: TradeEvent["type"][] = ["buy_signal", "sell_signal", "win", "loss"]
  const type = types[Math.floor(Math.random() * types.length)]
  const amount = Math.floor(Math.random() * 9000 + 500)
  const pnl =
    type === "win"
      ? Math.floor(Math.random() * 4000 + 200)
      : type === "loss"
        ? -Math.floor(Math.random() * 2500 + 100)
        : 0

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    agentAddress: randomAddress(),
    protocol: PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)],
    signalName: SIGNALS[Math.floor(Math.random() * SIGNALS.length)],
    amount,
    pnl,
  }
}

function tradeMessage(event: TradeEvent): string {
  switch (event.type) {
    case "buy_signal":
      return "Agent bought signal"
    case "sell_signal":
      return "Agent sold signal"
    case "win":
      return "Agent closed in profit"
    case "loss":
      return "Agent closed at loss"
  }
}

type AgentTradeFeedProps = {
  events: TradeEvent[]
  className?: string
}

export function AgentTradeFeed({ events, className }: AgentTradeFeedProps) {

  return (
    <aside
      className={cn(
        "flex w-full flex-col font-mono text-xs",
        className
      )}
    >
      <p className="border-b border-border px-3 py-2 text-[10px] text-muted-foreground">
        Real-time agent activity
      </p>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded border border-border/80 bg-background/40 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`font-semibold uppercase tracking-wide text-[10px] ${
                    event.type === "buy_signal"
                      ? "text-[#00ff88]"
                      : event.type === "sell_signal"
                        ? "text-sky-400"
                        : event.type === "win"
                          ? "text-emerald-400"
                          : "text-red-400"
                  }`}
                >
                  {tradeMessage(event)}
                </p>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                <span className="text-foreground/70">Address:</span> {event.agentAddress}
              </p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-foreground/70">Signal:</span> {event.signalName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-foreground/70">Protocol:</span> {event.protocol}
              </p>
              <p className="text-[10px] text-muted-foreground">
                <span className="text-foreground/70">Amount:</span>{" "}
                <span className="text-foreground">${event.amount.toLocaleString()}</span>
              </p>
              {(event.type === "win" || event.type === "loss") && (
                <p className="mt-1 text-[10px]">
                  <span className="text-foreground/70">PnL:</span>{" "}
                  <span className={event.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {event.pnl >= 0 ? "+" : ""}${event.pnl.toLocaleString()}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export function createMarketplaceTradeEvent(agentId: string): TradeEvent {
  const amount = Math.floor(Math.random() * 5000 + 800)
  return {
    id: `${Date.now()}-${agentId}`,
    timestamp: Date.now(),
    type: "buy_signal",
    agentAddress: randomAddress(),
    protocol: "Marketplace",
    signalName: SIGNALS[Math.floor(Math.random() * SIGNALS.length)],
    amount,
    pnl: 0,
  }
}
