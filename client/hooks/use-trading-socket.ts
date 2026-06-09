"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { AccountMode } from "@/lib/api/auth"
import { API_URL } from "@/lib/api/client"
import {
  TRADING_SOCKET_EVENTS,
  type LiveTradingFeedItem,
  type TradingActionExecutedEvent,
  type TradingCycleCompletedEvent,
  type TradingCycleStartedEvent,
} from "@/lib/api/trading-socket-types"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { tradingSocketEventMatchesMode } from "@/lib/trading-socket-mode"
import { formatReason } from "@/lib/trading-helpers"

export type PoolRouteCommand = {
  id: string
  poolFrom: string | null
  poolTo: string | null
  txHash?: string | null
}

type UseTradingSocketOptions = {
  accountMode?: AccountMode
  enabled?: boolean
  onCycleStarted?: (event: TradingCycleStartedEvent) => void
  onActionExecuted?: (event: TradingActionExecutedEvent) => void
  onCycleCompleted?: (event: TradingCycleCompletedEvent) => void
}

function poolLabel(poolId: string | null | undefined): string {
  if (!poolId) {
    return "pool"
  }
  return POOL_LABELS[poolId] ?? poolId
}

function feedItemFromAction(event: TradingActionExecutedEvent): LiveTradingFeedItem {
  const from = poolLabel(event.poolFrom)
  const to = poolLabel(event.poolTo)
  const pair =
    event.poolFrom && event.poolTo
      ? `${from} → ${to}`
      : event.tokenIn && event.tokenOut
        ? `${event.tokenIn} → ${event.tokenOut}`
        : event.type

  return {
    id: `${event.cycleId}-${event.at}-${event.txHash ?? event.type}`,
    at: event.at,
    headline: `${event.type}${event.toolName ? ` · ${event.toolName}` : ""}`,
    detail: pair,
    txHash: event.txHash,
    poolFrom: event.poolFrom,
    poolTo: event.poolTo,
    status: event.status,
  }
}

export function useTradingSocket(options: UseTradingSocketOptions = {}) {
  const { accountMode, enabled = true } = options
  const [connected, setConnected] = useState(false)
  const [feedItems, setFeedItems] = useState<LiveTradingFeedItem[]>([])
  const [routeCommand, setRouteCommand] = useState<PoolRouteCommand | null>(null)
  const [cycleActive, setCycleActive] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const pushFeed = useCallback((item: LiveTradingFeedItem) => {
    setFeedItems((prev) => [item, ...prev].slice(0, 50))
  }, [])

  useEffect(() => {
    setFeedItems([])
    setRouteCommand(null)
    setCycleActive(false)
  }, [accountMode])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const socket = io(API_URL, {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: true,
    })

    socketRef.current = socket

    const modeFilter = () => optionsRef.current.accountMode

    const matchesMode = (eventMode: AccountMode | undefined) =>
      tradingSocketEventMatchesMode(eventMode, modeFilter())

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    socket.on(TRADING_SOCKET_EVENTS.cycleStarted, (event: TradingCycleStartedEvent) => {
      if (!matchesMode(event.accountMode)) {
        return
      }
      setCycleActive(true)
      pushFeed({
        id: `start-${event.cycleId}`,
        at: event.startedAt,
        headline: "Cycle started",
        detail: formatReason(event.reason),
        status: "running",
      })
      optionsRef.current.onCycleStarted?.(event)
    })

    socket.on(
      TRADING_SOCKET_EVENTS.actionExecuted,
      (event: TradingActionExecutedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        pushFeed(feedItemFromAction(event))

        if (event.poolFrom || event.poolTo) {
          setRouteCommand({
            id: `${event.cycleId}-${event.at}`,
            poolFrom: event.poolFrom ?? null,
            poolTo: event.poolTo ?? event.poolFrom ?? null,
            txHash: event.txHash,
          })
        }

        optionsRef.current.onActionExecuted?.(event)
      },
    )

    socket.on(
      TRADING_SOCKET_EVENTS.cycleCompleted,
      (event: TradingCycleCompletedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        setCycleActive(false)
        pushFeed({
          id: `done-${event.cycleId}`,
          at: event.finishedAt,
          headline: `Cycle ${event.status}`,
          detail: event.llmResponse ?? event.message,
          status: event.status,
        })
        optionsRef.current.onCycleCompleted?.(event)
      },
    )

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [enabled, pushFeed, accountMode])

  return {
    connected,
    cycleActive,
    feedItems,
    routeCommand,
  }
}
