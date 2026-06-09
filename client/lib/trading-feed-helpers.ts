import type { AccountMode } from "@/lib/api/auth"
import type { LiveTradingFeedItem } from "@/lib/api/trading-socket-types"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type TradingActionRecord,
  type TradingHistoryDetail,
  type TradingHistoryListItem,
} from "@/lib/api/trading"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import { resolvePoolById } from "@/lib/pool-resolve"
import { POOL_LABELS } from "@/lib/strategy-presets"

export type PoolRouteCommand = {
  id: string
  poolFrom: string | null
  poolTo: string | null
  txHash?: string | null
  /** When false, agent rests at target pool without animating (history hydrate). */
  replay?: boolean
}
import {
  formatReason,
  lastTradeFromHistoryDetail,
  type LastTradeInfo,
} from "@/lib/trading-helpers"

const FEED_CAP = 50
const MAX_DETAIL_CYCLES = 5

function poolLabel(poolId: string | null | undefined): string {
  if (!poolId) {
    return "pool"
  }
  return POOL_LABELS[poolId] ?? poolId
}

function feedItemFromActionRecord(
  cycleId: string,
  action: TradingActionRecord,
): LiveTradingFeedItem {
  const from = poolLabel(action.poolFrom)
  const to = poolLabel(action.poolTo)
  const pair =
    action.poolFrom && action.poolTo
      ? `${from} → ${to}`
      : action.tokenIn && action.tokenOut
        ? `${action.tokenIn} → ${action.tokenOut}`
        : action.type

  return {
    id: `history-${cycleId}-${action.id}`,
    at: action.createdAt,
    headline: `${action.type}${action.toolName ? ` · ${action.toolName}` : ""}`,
    detail: pair,
    txHash: action.txHash,
    poolFrom: action.poolFrom,
    poolTo: action.poolTo,
    status: action.status,
  }
}

function feedItemFromSubAgent(
  cycleId: string,
  action: TradingActionRecord,
): LiveTradingFeedItem | null {
  const meta = action.metadata as Record<string, unknown> | null
  if (!meta) return null

  const agentId = typeof meta.agentId === "string" ? meta.agentId : action.toolName ?? "unknown"
  const agentName = typeof meta.agentName === "string" ? meta.agentName : agentId
  const summary = typeof meta.summary === "string" ? meta.summary : "Analysis complete."
  const data = meta.data && typeof meta.data === "object" ? meta.data as Record<string, unknown> : undefined
  const durationMs = typeof meta.durationMs === "number" ? meta.durationMs : undefined

  return {
    id: `history-sub-${cycleId}-${action.id}`,
    at: action.createdAt,
    headline: `${agentName} complete`,
    detail: summary,
    status: "completed",
    subAgent: {
      agentId,
      agentName,
      summary,
      data,
      durationMs,
    },
  }
}

function feedItemsFromCycleDetail(detail: TradingHistoryDetail): LiveTradingFeedItem[] {
  const items: LiveTradingFeedItem[] = [
    {
      id: `history-done-${detail.id}`,
      at: detail.finishedAt,
      headline: `Cycle ${detail.status}`,
      detail: detail.llmResponse ?? detail.message,
      status: detail.status,
      cycleId: detail.id,
      llmResponse: detail.llmResponse,
    },
  ]

  const actions = [...detail.actions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  for (const action of actions) {
    if (action.type === "sub_agent") {
      const subItem = feedItemFromSubAgent(detail.id, action)
      if (subItem) items.push(subItem)
      continue
    }
    if (
      action.type === "quote" ||
      action.type === "tool" ||
      action.toolName === "listPools" ||
      action.toolName === "getPortfolio"
    ) {
      continue
    }
    items.push(feedItemFromActionRecord(detail.id, action))
  }

  items.push({
    id: `history-start-${detail.id}`,
    at: detail.startedAt,
    headline: "Cycle started",
    detail: formatReason(detail.reason),
    status: "running",
  })

  return items
}

function feedItemFromListRow(item: TradingHistoryListItem): LiveTradingFeedItem[] {
  if (item.actionCount > 0) {
    return []
  }

  return [
    {
      id: `history-done-${item.id}`,
      at: item.finishedAt,
      headline: `Cycle ${item.status}`,
      detail: item.llmResponse ?? item.message,
      status: item.status,
      cycleId: item.id,
      llmResponse: item.llmResponse,
    },
    {
      id: `history-start-${item.id}`,
      at: item.startedAt,
      headline: "Cycle started",
      detail: formatReason(item.reason),
      status: "running",
    },
  ]
}

export function routeCommandFromLastTrade(
  trade: LastTradeInfo,
  replay = false,
): PoolRouteCommand | null {
  if (!trade.poolFrom && !trade.poolTo) {
    return null
  }

  return {
    id: `history-route-${trade.at}`,
    poolFrom: trade.poolFrom,
    poolTo: trade.poolTo ?? trade.poolFrom,
    txHash: trade.txHash,
    replay,
  }
}

export function largestAllocationPoolId(
  poolAmounts: Record<string, number>,
): string | null {
  let bestId: string | null = null
  let bestAmount = 0

  for (const [poolId, amount] of Object.entries(poolAmounts)) {
    if (amount > bestAmount) {
      bestAmount = amount
      bestId = poolId
    }
  }

  return bestId
}

export function idleRouteForPool(poolId: string | null): PoolRouteCommand | null {
  if (!poolId) {
    return null
  }

  return {
    id: `idle-${poolId}`,
    poolFrom: poolId,
    poolTo: poolId,
    replay: false,
  }
}

export function normalizePoolRouteCommand(
  route: PoolRouteCommand | null,
  quickswapPools: readonly QuickSwapPool[],
): PoolRouteCommand | null {
  if (!route) {
    return null
  }

  const poolFrom = route.poolFrom
    ? (resolvePoolById(route.poolFrom, quickswapPools)?.id ?? null)
    : null
  const poolTo = route.poolTo
    ? (resolvePoolById(route.poolTo, quickswapPools)?.id ?? null)
    : null

  if (!poolFrom && !poolTo) {
    return null
  }

  return {
    ...route,
    poolFrom,
    poolTo,
  }
}

export type TradingFeedHistoryResult = {
  feedItems: LiveTradingFeedItem[]
  routeCommand: PoolRouteCommand | null
}

export async function buildFeedFromTradingHistory(
  accountMode: AccountMode,
): Promise<TradingFeedHistoryResult> {
  const historyResult = await fetchTradingHistory(1, 20, accountMode)
  if (!historyResult.success || !historyResult.data?.items.length) {
    return { feedItems: [], routeCommand: null }
  }

  const items = historyResult.data.items
  const detailCandidates = items
    .filter((row) => row.actionCount > 0)
    .slice(0, MAX_DETAIL_CYCLES)

  const detailResults = await Promise.all(
    detailCandidates.map((row) => fetchTradingCycleDetail(row.id)),
  )

  const detailsById = new Map<string, TradingHistoryDetail>()
  for (const result of detailResults) {
    if (result.success && result.data?.cycle) {
      detailsById.set(result.data.cycle.id, result.data.cycle)
    }
  }

  const feedItems: LiveTradingFeedItem[] = []

  for (const row of items) {
    const detail = detailsById.get(row.id)
    if (detail) {
      feedItems.push(...feedItemsFromCycleDetail(detail))
    } else {
      feedItems.push(...feedItemFromListRow(row))
    }
  }

  let routeCommand: PoolRouteCommand | null = null
  for (const row of items) {
    const detail = detailsById.get(row.id)
    if (!detail) {
      continue
    }
    const trade = lastTradeFromHistoryDetail(detail)
    if (trade && (trade.poolFrom || trade.poolTo)) {
      routeCommand = routeCommandFromLastTrade(trade, false)
      break
    }
  }

  return {
    feedItems: feedItems.slice(0, FEED_CAP),
    routeCommand,
  }
}
