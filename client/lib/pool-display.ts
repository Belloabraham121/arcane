import type { QuickSwapPool } from "@/lib/api/quickswap-types"
import { formatLiquidity } from "@/lib/pool-allocations"

export function formatApyPercent(feeApr: number | null | undefined): string {
  if (feeApr == null || !Number.isFinite(feeApr) || feeApr <= 0) {
    return "—"
  }
  // Ranking cap — not meaningful as displayed APR
  if (feeApr >= 500) {
    return "—"
  }
  return `${feeApr.toFixed(2)}%`
}

export function formatUsdMetric(value: string | null | undefined): string {
  if (!value) {
    return "—"
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return "—"
  }
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}K`
  }
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function formatPoolTvlUsd(totalValueLockedUsd: string | null | undefined): string {
  return formatUsdMetric(totalValueLockedUsd)
}

export function formatPoolVolumeUsd(volumeUsd: string | null | undefined): string {
  return formatUsdMetric(volumeUsd)
}

export function formatOnChainLiquidity(liquidity: string | null | undefined): string {
  if (!liquidity) {
    return "—"
  }
  const formatted = formatLiquidity(liquidity)
  return formatted === "0" ? "—" : formatted
}

export function poolPairLabel(pool: QuickSwapPool): string {
  return `${pool.token0.symbol}/${pool.token1.symbol}`
}

export type PoolDisplayStats = {
  label: string
  pair: string
  tvlUsd: string
  volumeUsd: string
  liquidity: string
  apy: string
  priceHint: string | null
}

export function poolDisplayStats(pool: QuickSwapPool): PoolDisplayStats {
  return {
    label: pool.label,
    pair: poolPairLabel(pool),
    tvlUsd: formatPoolTvlUsd(pool.metrics.totalValueLockedUsd),
    volumeUsd: formatPoolVolumeUsd(pool.metrics.volumeUsd),
    liquidity: formatOnChainLiquidity(pool.metrics.liquidity),
    apy: formatApyPercent(pool.metrics.feeApr),
    priceHint: pool.metrics.priceLabel,
  }
}
