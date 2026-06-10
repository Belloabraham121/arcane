import type { AccountMode } from "@/lib/api/auth"
import type { MarketplacePurchaseRecord } from "@/lib/api/marketplace"
import { fetchMarketplacePurchases } from "@/lib/api/marketplace"
import { marketplaceProductLabel } from "@/lib/marketplace-display"
import type { WalletTokenBalance } from "@/lib/api/wallet"
import {
  fetchTradingCycleDetail,
  fetchTradingHistory,
  type ExecutedTransaction,
  type PoolAllocationDrift,
  type TradingActionRecord,
  type TradingCycleSummary,
  type TradingHistoryDetail,
  type TradingStatus,
} from "@/lib/api/trading"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"
import {
  formatApyPercent,
  formatOnChainLiquidity,
  formatPoolTvlUsd,
  formatPoolVolumeUsd,
  poolPairLabel,
} from "@/lib/pool-display"
import { poolColorForId, poolColorsForIds } from "@/lib/pool-node-colors"
import { activeResolvablePoolEntries, resolvePoolById } from "@/lib/pool-resolve"
import { POOL_LABELS } from "@/lib/strategy-presets"
import { APP_ROUTES } from "@/lib/routing/app-routes"

export type AgentDisplayStatus =
  | "idle"
  | "analyzing"
  | "executing"
  | "waiting_deposit"
  | "paused"

const AGENT_STATUS_LABELS: Record<AgentDisplayStatus, string> = {
  idle: "Idle",
  analyzing: "Analyzing",
  executing: "Executing",
  waiting_deposit: "Waiting for deposit",
  paused: "Paused",
}

const AGENT_STATUS_COLORS: Record<AgentDisplayStatus, string> = {
  idle: "text-muted-foreground border-border",
  analyzing: "text-[#ea580c] border-[#ea580c]/40 bg-[#ea580c]/5",
  executing: "text-[#16a34a] border-[#16a34a]/40 bg-[#16a34a]/5",
  waiting_deposit: "text-amber-600 border-amber-600/40 bg-amber-600/5",
  paused: "text-amber-700 border-amber-600/50 bg-amber-500/10 dark:text-amber-400",
}

export function agentStatusLabel(status: AgentDisplayStatus): string {
  return AGENT_STATUS_LABELS[status]
}

export function agentStatusClassName(status: AgentDisplayStatus): string {
  return AGENT_STATUS_COLORS[status]
}

export function walletHasBalance(balances: WalletTokenBalance[]): boolean {
  return balances.some((row) => {
    const n = Number(row.formatted)
    return Number.isFinite(n) && n > 0
  })
}

export function deriveAgentDisplayStatus(input: {
  strategyActive: boolean
  tradingStatus: TradingStatus | null
  walletBalances: WalletTokenBalance[]
}): AgentDisplayStatus {
  if (!input.strategyActive) {
    return "idle"
  }

  if (!walletHasBalance(input.walletBalances)) {
    return "waiting_deposit"
  }

  const phase = input.tradingStatus?.phase ?? "idle"
  const lastCycle = input.tradingStatus?.lastCycle

  if (phase === "analyzing") {
    const hasSwapTools = lastCycle?.toolActions?.some(
      (action) =>
        action.tool === "swapExactIn" ||
        action.tool === "rebalanceToPool",
    )
    const hasExecuted =
      (lastCycle?.executedTransactions?.length ?? 0) > 0
    if (hasSwapTools || hasExecuted) {
      return "executing"
    }
    return "analyzing"
  }

  return "idle"
}

export type ActivePoolRow = {
  poolId: string
  label: string
  pair: string
  /** Hex color from shared pool palette. */
  color: string
  tvlUsd: string
  volumeUsd: string
  liquidity: string
  apy: string
  targetPercent: number
  currentPercent: number | null
  driftPercent: number | null
  /** Estimated USD in this pool from wallet allocation %. */
  allocatedValueUsd: number | null
}

export function buildActivePoolRows(
  poolAllocations: PoolAllocations,
  poolDrift: PoolAllocationDrift[] | undefined,
  pools: QuickSwapPool[] = [],
  options?: { portfolioValueUsd?: number },
): ActivePoolRow[] {
  const entries = activeResolvablePoolEntries(poolAllocations, pools)
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0)
  const driftById = Object.fromEntries(
    (poolDrift ?? []).map((row) => [row.poolId, row]),
  )
  const colorLookup = poolColorsForIds(entries.map(([id]) => id))
  const portfolioValue = options?.portfolioValueUsd

  return entries.map(([poolId, amount]) => {
    const drift = driftById[poolId]
    const pool = resolvePoolById(poolId, pools)!
    const targetPercent = total > 0 ? (amount / total) * 100 : 0
    const livePercent = drift?.currentPercent ?? targetPercent
    const allocatedValueUsd =
      portfolioValue != null && Number.isFinite(portfolioValue)
        ? (portfolioValue * livePercent) / 100
        : null

    return {
      poolId,
      label: drift?.label ?? pool?.label ?? POOL_LABELS[poolId] ?? poolId,
      pair: pool ? poolPairLabel(pool) : "—",
      color: poolColorForId(poolId, colorLookup),
      tvlUsd: pool ? formatPoolTvlUsd(pool.metrics.totalValueLockedUsd) : "—",
      volumeUsd: pool ? formatPoolVolumeUsd(pool.metrics.volumeUsd) : "—",
      liquidity: pool ? formatOnChainLiquidity(pool.metrics.liquidity) : "—",
      apy: pool ? formatApyPercent(pool.metrics.feeApr) : "—",
      targetPercent,
      currentPercent: drift?.currentPercent ?? null,
      driftPercent: drift?.driftPercent ?? null,
      allocatedValueUsd,
    }
  })
}

export type ExecutionKind = "executor" | "marketplace"

export type HistoryExecutionFilter = "all" | ExecutionKind

export type LastTradeInfo = {
  kind: string
  executionKind: ExecutionKind
  label: string
  amountIn: string | null
  amountOut: string | null
  tokenIn: string | null
  tokenOut: string | null
  poolFrom: string | null
  poolTo: string | null
  txHash: string | null
  status: string
  at: string
  accountMode?: AccountMode | null
  productId?: string
  amountSttWei?: string
}

function poolLabel(poolId: string | null): string | null {
  if (!poolId) {
    return null
  }
  return POOL_LABELS[poolId] ?? poolId
}

function tradeFromExecuted(tx: ExecutedTransaction, at: string): LastTradeInfo {
  return {
    kind: tx.kind,
    executionKind: "executor",
    label:
      tx.kind === "swap"
        ? `${tx.tokenIn ?? "?"} → ${tx.tokenOut ?? "?"}`
        : `Approve ${tx.tokenIn ?? "token"}`,
    amountIn: tx.amountIn ?? null,
    amountOut: tx.amountOut ?? null,
    tokenIn: tx.tokenIn ?? null,
    tokenOut: tx.tokenOut ?? null,
    poolFrom: null,
    poolTo: null,
    txHash: tx.hash,
    status: tx.status,
    at,
  }
}

function tradeFromAction(action: TradingActionRecord): LastTradeInfo | null {
  if (action.type !== "swap" && action.type !== "rebalance" && action.type !== "approve") {
    return null
  }

  const from = poolLabel(action.poolFrom)
  const to = poolLabel(action.poolTo)

  let label = action.type
  if (action.type === "rebalance" && from && to) {
    label = `${from} → ${to}`
  } else if (action.type === "swap" && action.tokenIn && action.tokenOut) {
    label = `${action.tokenIn} → ${action.tokenOut}`
  }

  return {
    kind: action.type,
    executionKind: "executor",
    label,
    amountIn: action.amountIn,
    amountOut: action.amountOut,
    tokenIn: action.tokenIn,
    tokenOut: action.tokenOut,
    poolFrom: action.poolFrom,
    poolTo: action.poolTo,
    txHash: action.txHash,
    status: action.status,
    at: action.createdAt,
  }
}

export function lastTradeFromCycle(
  cycle: TradingCycleSummary | null,
  finishedAt: string | null,
): LastTradeInfo | null {
  if (!cycle) {
    return null
  }

  const at = finishedAt ?? cycle.finishedAt
  const accountMode = cycle.accountMode ?? null
  const swapTx = [...cycle.executedTransactions]
    .reverse()
    .find((tx) => tx.kind === "swap")
  if (swapTx) {
    return { ...tradeFromExecuted(swapTx, at), accountMode }
  }

  const anyTx = cycle.executedTransactions.at(-1)
  if (anyTx) {
    return { ...tradeFromExecuted(anyTx, at), accountMode }
  }

  return null
}

export function tradesFromHistoryDetail(
  detail: TradingHistoryDetail,
): LastTradeInfo[] {
  return [...detail.actions]
    .reverse()
    .filter((action) => action.type === "swap" || action.type === "rebalance")
    .map((action) => tradeFromAction(action))
    .filter((trade): trade is LastTradeInfo => trade != null)
    .map((trade) => ({ ...trade, accountMode: detail.accountMode }))
}

export function lastTradeFromHistoryDetail(
  detail: TradingHistoryDetail,
): LastTradeInfo | null {
  const trades = tradesFromHistoryDetail(detail)
  return (
    trades.find((trade) => trade.txHash) ??
    trades[0] ??
    null
  )
}

function tradeFromMarketplacePurchase(
  purchase: MarketplacePurchaseRecord,
  accountMode: AccountMode,
): LastTradeInfo {
  return {
    kind: "marketplace_purchase",
    executionKind: "marketplace",
    label: `x402 · ${marketplaceProductLabel(purchase.productId)}`,
    amountIn: null,
    amountOut: null,
    tokenIn: null,
    tokenOut: null,
    poolFrom: null,
    poolTo: null,
    txHash: purchase.txHash,
    status: purchase.status,
    at: purchase.createdAt,
    accountMode,
    productId: purchase.productId,
    amountSttWei: purchase.amountSttWei,
  }
}

export function marketplaceTradesFromHistoryDetail(
  detail: TradingHistoryDetail,
): LastTradeInfo[] {
  return detail.actions
    .filter((action) => action.type === "marketplace_purchase")
    .map((action) => {
      const meta =
        action.metadata && typeof action.metadata === "object"
          ? (action.metadata as Record<string, unknown>)
          : null
      const productId =
        typeof meta?.productId === "string"
          ? meta.productId
          : (action.toolName ?? "unknown")
      const amountSttWei =
        typeof meta?.amountSttWei === "string" ? meta.amountSttWei : "0"
      return {
        kind: "marketplace_purchase",
        executionKind: "marketplace" as const,
        label: `x402 · ${marketplaceProductLabel(productId)}`,
        amountIn: null,
        amountOut: null,
        tokenIn: null,
        tokenOut: null,
        poolFrom: null,
        poolTo: null,
        txHash: action.txHash,
        status: action.status,
        at: action.createdAt,
        accountMode: detail.accountMode,
        productId,
        amountSttWei,
      }
    })
}

export function cycleMatchesExecutionFilter(
  detail: TradingHistoryDetail,
  filter: HistoryExecutionFilter,
): boolean {
  if (filter === "all") {
    return true
  }
  if (filter === "marketplace") {
    return detail.actions.some((action) => action.type === "marketplace_purchase")
  }
  return detail.actions.some(
    (action) =>
      action.type === "swap" ||
      action.type === "rebalance" ||
      action.type === "approve",
  )
}

const RECENT_TRADE_LIMIT = 5

export async function loadRecentTrades(
  accountMode: AccountMode,
  limit = RECENT_TRADE_LIMIT,
): Promise<LastTradeInfo[]> {
  const [historyResult, purchasesResult] = await Promise.all([
    fetchTradingHistory(1, 8, accountMode),
    fetchMarketplacePurchases(20),
  ])

  const executorTrades: LastTradeInfo[] = []
  if (historyResult.success && historyResult.data?.items.length) {
    const detailResults = await Promise.all(
      historyResult.data.items.map((item) => fetchTradingCycleDetail(item.id)),
    )
    executorTrades.push(
      ...detailResults.flatMap((result) =>
        result.success && result.data?.cycle
          ? tradesFromHistoryDetail(result.data.cycle)
          : [],
      ),
    )
  }

  const marketplaceTrades =
    purchasesResult.success && purchasesResult.data?.purchases
      ? purchasesResult.data.purchases.map((purchase) =>
          tradeFromMarketplacePurchase(purchase, accountMode),
        )
      : []

  const trades = [...executorTrades, ...marketplaceTrades].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  const seen = new Set<string>()
  const unique: LastTradeInfo[] = []
  for (const trade of trades) {
    const key =
      trade.txHash ??
      `${trade.executionKind}-${trade.label}-${trade.at}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(trade)
    if (unique.length >= limit) {
      break
    }
  }

  return unique
}

export function tradingHistoryFilterHref(
  filter: HistoryExecutionFilter,
): string {
  if (filter === "all") {
    return APP_ROUTES.tradingHistory
  }
  return `${APP_ROUTES.tradingHistory}?filter=${filter}`
}

export function formatReason(reason: string): string {
  return reason.replace(/_/g, " ")
}
