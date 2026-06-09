"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { AccountMode } from "@/lib/api/auth"
import { API_URL } from "@/lib/api/client"
import {
  TRADING_SOCKET_EVENTS,
  type LiveTradingFeedItem,
  type MarketplacePurchaseCompletedEvent,
  type MarketplacePurchaseStartedEvent,
  type SubAgentCompletedEvent,
  type SubAgentStartedEvent,
  type SubAgentStatus,
  type TradingActionExecutedEvent,
  type TradingCycleCompletedEvent,
  type TradingCycleStartedEvent,
} from "@/lib/api/trading-socket-types"
import {
  buildFeedFromTradingHistory,
  type PoolRouteCommand,
} from "@/lib/trading-feed-helpers"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { tradingSocketEventMatchesMode } from "@/lib/trading-socket-mode"
import { formatReason } from "@/lib/trading-helpers"
import type { MarketplaceTripCommand } from "@/lib/marketplace-canvas"

export type { PoolRouteCommand } from "@/lib/trading-feed-helpers"

type UseTradingSocketOptions = {
  accountMode?: AccountMode
  enabled?: boolean
  /** Load recent trading history into the feed on mount / mode change. */
  hydrateFromHistory?: boolean
  onCycleStarted?: (event: TradingCycleStartedEvent) => void
  onActionExecuted?: (event: TradingActionExecutedEvent) => void
  onSubAgentStarted?: (event: SubAgentStartedEvent) => void
  onSubAgentCompleted?: (event: SubAgentCompletedEvent) => void
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
  const {
    accountMode,
    enabled = true,
    hydrateFromHistory = false,
  } = options
  const [connected, setConnected] = useState(false)
  const [historyFeed, setHistoryFeed] = useState<LiveTradingFeedItem[]>([])
  const [liveFeed, setLiveFeed] = useState<LiveTradingFeedItem[]>([])
  const [historyRoute, setHistoryRoute] = useState<PoolRouteCommand | null>(null)
  const [liveRoute, setLiveRoute] = useState<PoolRouteCommand | null>(null)
  const [cycleActive, setCycleActive] = useState(false)
  const [subAgentStatuses, setSubAgentStatuses] = useState<SubAgentStatus[]>([])
  const [marketplaceTripCommands, setMarketplaceTripCommands] = useState<
    Record<string, MarketplaceTripCommand>
  >({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const marketplaceReturnTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const optionsRef = useRef(options)
  optionsRef.current = options

  const feedItems = useMemo(
    () => [...liveFeed, ...historyFeed].slice(0, 50),
    [liveFeed, historyFeed],
  )

  const routeCommand = liveRoute ?? historyRoute

  const pushLiveFeed = useCallback((item: LiveTradingFeedItem) => {
    setLiveFeed((prev) => [item, ...prev].slice(0, 50))
  }, [])

  useEffect(() => {
    setHistoryFeed([])
    setLiveFeed([])
    setHistoryRoute(null)
    setLiveRoute(null)
    setCycleActive(false)
    setSubAgentStatuses([])
    setMarketplaceTripCommands({})
  }, [accountMode])

  useEffect(() => {
    if (!enabled || !accountMode || !hydrateFromHistory) {
      setHistoryLoading(false)
      return
    }

    let cancelled = false
    setHistoryLoading(true)

    async function loadHistory() {
      const result = await buildFeedFromTradingHistory(accountMode!)
      if (cancelled) {
        return
      }
      setHistoryFeed(result.feedItems)
      setHistoryRoute(result.routeCommand)
      setHistoryLoading(false)
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [accountMode, enabled, hydrateFromHistory])

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
      setSubAgentStatuses([])
      setMarketplaceTripCommands({})
      pushLiveFeed({
        id: `start-${event.cycleId}`,
        at: event.startedAt,
        headline: "Cycle started",
        detail: formatReason(event.reason),
        status: "running",
      })
      optionsRef.current.onCycleStarted?.(event)
    })

    socket.on(
      TRADING_SOCKET_EVENTS.subAgentStarted,
      (event: SubAgentStartedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        setSubAgentStatuses((prev) => {
          const exists = prev.find((s) => s.agentId === event.agentId)
          if (exists) {
            return prev.map((s) =>
              s.agentId === event.agentId
                ? { ...s, status: "running" as const }
                : s,
            )
          }
          return [
            ...prev,
            {
              agentId: event.agentId,
              agentName: event.agentName,
              status: "running" as const,
            },
          ]
        })
        pushLiveFeed({
          id: `sub-start-${event.cycleId}-${event.agentId}`,
          at: event.at,
          headline: `${event.agentName} analyzing`,
          detail: "Sub-agent reading portfolio data…",
          status: "running",
          subAgent: {
            agentId: event.agentId,
            agentName: event.agentName,
            summary: "Analyzing…",
          },
        })
        optionsRef.current.onSubAgentStarted?.(event)
      },
    )

    socket.on(
      TRADING_SOCKET_EVENTS.subAgentCompleted,
      (event: SubAgentCompletedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        setSubAgentStatuses((prev) =>
          prev.map((s) =>
            s.agentId === event.agentId
              ? {
                  ...s,
                  status: "completed" as const,
                  summary: event.summary,
                }
              : s,
          ),
        )
        pushLiveFeed({
          id: `sub-done-${event.cycleId}-${event.agentId}`,
          at: event.at,
          headline: `${event.agentName} complete`,
          detail: event.summary,
          status: "completed",
          subAgent: {
            agentId: event.agentId,
            agentName: event.agentName,
            summary: event.summary,
            durationMs: event.durationMs,
          },
        })
        optionsRef.current.onSubAgentCompleted?.(event)
      },
    )

    socket.on(
      TRADING_SOCKET_EVENTS.marketplacePurchaseStarted,
      (event: MarketplacePurchaseStartedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        pushLiveFeed({
          id: `mkt-start-${event.cycleId}-${event.agentId}-${event.productId}`,
          at: new Date().toISOString(),
          headline: `${event.agentName} → Marketplace`,
          detail: `Buying ${event.productId} (${event.amountSttWei} STT wei)`,
          status: "running",
          cycleId: event.cycleId,
          marketplace: {
            productId: event.productId,
            amountSttWei: event.amountSttWei,
            agentId: event.agentId,
            agentName: event.agentName,
          },
        })
        setMarketplaceTripCommands((prev) => ({
          ...prev,
          [event.agentId]: {
            phase: "to_marketplace",
            homePoolIndex: prev[event.agentId]?.homePoolIndex ?? 0,
            productId: event.productId,
          },
        }))
      },
    )

    socket.on(
      TRADING_SOCKET_EVENTS.marketplacePurchaseCompleted,
      (event: MarketplacePurchaseCompletedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        pushLiveFeed({
          id: `mkt-done-${event.cycleId}-${event.agentId}-${event.productId}`,
          at: event.at,
          headline: event.success
            ? `Marketplace · ${event.productId}`
            : `Marketplace failed · ${event.productId}`,
          detail: event.success
            ? `Paid ${event.amountSttWei} STT wei`
            : (event.error ?? "Purchase failed"),
          txHash: event.txHash ?? null,
          status: event.success ? "completed" : "failed",
          cycleId: event.cycleId,
          marketplace: {
            productId: event.productId,
            amountSttWei: event.amountSttWei,
            agentId: event.agentId,
            agentName: event.agentName,
          },
        })

        const existingTimer = marketplaceReturnTimers.current.get(event.agentId)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        if (event.success) {
          setMarketplaceTripCommands((prev) => ({
            ...prev,
            [event.agentId]: {
              phase: "at_marketplace",
              homePoolIndex: prev[event.agentId]?.homePoolIndex ?? 0,
              productId: event.productId,
            },
          }))
          const timer = setTimeout(() => {
            setMarketplaceTripCommands((prev) => ({
              ...prev,
              [event.agentId]: {
                phase: "to_pool",
                homePoolIndex: prev[event.agentId]?.homePoolIndex ?? 0,
                productId: event.productId,
                triggerDataPulse: true,
              },
            }))
            marketplaceReturnTimers.current.delete(event.agentId)
          }, 700)
          marketplaceReturnTimers.current.set(event.agentId, timer)
        } else {
          setMarketplaceTripCommands((prev) => ({
            ...prev,
            [event.agentId]: {
              phase: "idle",
              homePoolIndex: prev[event.agentId]?.homePoolIndex ?? 0,
            },
          }))
        }
      },
    )

    socket.on(
      TRADING_SOCKET_EVENTS.actionExecuted,
      (event: TradingActionExecutedEvent) => {
        if (!matchesMode(event.accountMode)) {
          return
        }
        pushLiveFeed(feedItemFromAction(event))

        if (event.poolFrom || event.poolTo) {
          setLiveRoute({
            id: `${event.cycleId}-${event.at}`,
            poolFrom: event.poolFrom ?? null,
            poolTo: event.poolTo ?? event.poolFrom ?? null,
            txHash: event.txHash,
            replay: true,
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
        pushLiveFeed({
          id: `done-${event.cycleId}`,
          at: event.finishedAt,
          headline: `Cycle ${event.status}`,
          detail: event.llmResponse ?? event.message,
          status: event.status,
          cycleId: event.cycleId,
          llmResponse: event.llmResponse,
        })
        optionsRef.current.onCycleCompleted?.(event)
      },
    )

    return () => {
      for (const timer of marketplaceReturnTimers.current.values()) {
        clearTimeout(timer)
      }
      marketplaceReturnTimers.current.clear()
      socket.disconnect()
      socketRef.current = null
    }
  }, [enabled, pushLiveFeed, accountMode])

  return {
    connected,
    cycleActive,
    feedItems,
    routeCommand,
    subAgentStatuses,
    marketplaceTripCommands,
    historyLoading,
  }
}
