"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createRandomTrade,
  type TradeEvent,
} from "@/components/agent-trade-feed"

export function useTradeEvents() {
  const [events, setEvents] = useState<TradeEvent[]>(() =>
    Array.from({ length: 10 }, () => createRandomTrade())
  )

  const pushEvent = useCallback((event: TradeEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 40))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      pushEvent(createRandomTrade())
    }, 3000)
    return () => clearInterval(interval)
  }, [pushEvent])

  return { events, pushEvent }
}
