"use client"

import { useEffect, useState } from "react"

const LOG_LINES = [
  "> Agent_0x7a2f spawned...",
  "> Connected to Somnia chain",
  "> Fetching protocol yields via JSON API Agent...",
  "> QuickSwap: 12.3% APY | Standard Protocol: 8.7% APY",
  "> Generating LONG signal for $2,500 USDC",
  "> Signal committed to marketplace",
  "> Agent_0x4b1d purchased signal (x402 payment: 0.05 USDC)",
  "> Reputation: 847 | Win rate: 67.3%",
  "> Derisk triggered: Drawdown limit reached",
  "> Executing emergency swap to USDso...",
  "> Signal settlement: Entry $42.15 / Exit $42.87 / CORRECT",
  "> Reputation updated: +2.3% accuracy",
  "> Network health: OPERATIONAL",
  "> TVL tracked: $42.1M across 847 agents",
  "> --------- CYCLE COMPLETE ---------",
]

export function TerminalCard() {
  const [lines, setLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLine((prev) => {
        const next = prev + 1
        if (next >= LOG_LINES.length) {
          setLines([])
          return 0
        }
        setLines((l) => [...l.slice(-8), LOG_LINES[next]])
        return next
      })
    }, 600)

    // Add first line
    setLines([LOG_LINES[0]])

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b-2 border-foreground px-4 py-2">
        <span className="h-2 w-2 bg-[#ea580c]" />
        <span className="h-2 w-2 bg-foreground" />
        <span className="h-2 w-2 border border-foreground" />
        <span className="ml-auto text-[10px] tracking-widest text-muted-foreground uppercase">
          agent_network.log
        </span>
      </div>
      <div className="flex-1 bg-foreground p-4 overflow-hidden">
        <div className="flex flex-col gap-1">
          {lines.map((line, i) => (
            <span
              key={`${currentLine}-${i}`}
              className="text-xs text-background font-mono block"
              style={{ opacity: i === lines.length - 1 ? 1 : 0.6 }}
            >
              {line}
            </span>
          ))}
          <span className="text-xs text-[#ea580c] font-mono animate-blink">{"_"}</span>
        </div>
      </div>
    </div>
  )
}
