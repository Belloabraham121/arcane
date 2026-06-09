import { useMemo } from "react"
import { PoolStatsBadges } from "@/components/pool-stats-badges"
import { PoolAllocationEditorSkeleton } from "@/components/skeletons/content-skeletons"
import { Skeleton } from "@/components/ui/skeleton"
import type { PoolSortField, QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"
import { poolDisplayStats } from "@/lib/pool-display"
import { resolvePoolById } from "@/lib/pool-resolve"

const SORT_OPTIONS: Array<{ value: PoolSortField; label: string }> = [
  { value: "liquidity", label: "Liquidity" },
  { value: "apy", label: "APY" },
  { value: "tvl", label: "TVL" },
  { value: "volume", label: "Volume" },
]

type PoolAllocationEditorProps = {
  pools: QuickSwapPool[]
  values: PoolAllocations
  onChange: (next: PoolAllocations) => void
  mode?: "auto" | "custom"
  /** When true, shows active pools separately from a browsable add-pool catalog. */
  editMode?: boolean
  loading?: boolean
  refetching?: boolean
  error?: string | null
  title?: string
  subtitle?: string | null
  sort?: PoolSortField
  onSortChange?: (sort: PoolSortField) => void
}

function shortPoolId(poolId: string): string {
  if (poolId.startsWith("0x") && poolId.length > 12) {
    return `${poolId.slice(0, 6)}…${poolId.slice(-4)}`
  }
  return poolId
}

function stubPool(poolId: string): QuickSwapPool {
  return {
    id: poolId,
    label: shortPoolId(poolId),
    address: poolId as `0x${string}`,
    token0: {
      address: "0x0000000000000000000000000000000000000000",
      symbol: "?",
      name: "Unknown",
      decimals: 18,
    },
    token1: {
      address: "0x0000000000000000000000000000000000000000",
      symbol: "?",
      name: "Unknown",
      decimals: 18,
    },
    metrics: {
      sqrtPriceX96: "0",
      tick: 0,
      liquidity: "0",
      reserve0: "0",
      reserve1: "0",
      lastFee: 0,
      token1PerToken0: null,
      token0PerToken1: null,
      priceLabel: null,
      feeTierPercent: null,
      feeApr: null,
      totalValueLockedUsd: null,
      volumeUsd: null,
      lastUpdated: "",
    },
  }
}

function PoolMetricsLines({ pool }: { pool: QuickSwapPool }) {
  const stats = poolDisplayStats(pool)

  return (
    <>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {stats.pair}
      </p>
      <div className="mt-1">
        <PoolStatsBadges
          tvlUsd={stats.tvlUsd}
          volumeUsd={stats.volumeUsd}
          liquidity={stats.liquidity}
          apy={stats.apy}
        />
      </div>
      {stats.priceHint && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{stats.priceHint}</p>
      )}
      {pool.metrics.feeTierPercent != null && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          Swap fee {pool.metrics.feeTierPercent}%
        </p>
      )}
    </>
  )
}

export function PoolAllocationEditor({
  pools,
  values,
  onChange,
  mode = "auto",
  editMode = false,
  loading = false,
  refetching = false,
  error = null,
  title = "QuickSwap pool allocation",
  subtitle = null,
  sort = "liquidity",
  onSortChange,
}: PoolAllocationEditorProps) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)

  const { activePools, catalogPools } = useMemo(() => {
    if (!editMode) {
      return { activePools: pools, catalogPools: [] as QuickSwapPool[] }
    }

    const activeIds = Object.entries(values)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id)

    const active = activeIds.map((id) => resolvePoolById(id, pools) ?? stubPool(id))
    const activeIdSet = new Set(activeIds)
    const catalog = pools.filter((pool) => !activeIdSet.has(pool.id))

    return { activePools: active, catalogPools: catalog }
  }, [editMode, pools, values])

  function setAmount(poolId: string, amount: number) {
    onChange({ ...values, [poolId]: Math.max(0, amount) })
  }

  function addPool(poolId: string) {
    const activeCount = Object.values(values).filter((amount) => amount > 0).length
    const fallback = Math.max(1, Math.round(total / Math.max(activeCount + 1, 1)))
    onChange({ ...values, [poolId]: fallback })
  }

  function removePool(poolId: string) {
    onChange({ ...values, [poolId]: 0 })
  }

  function togglePool(poolId: string, enabled: boolean) {
    if (enabled) {
      addPool(poolId)
      return
    }
    removePool(poolId)
  }

  function renderActivePool(pool: QuickSwapPool) {
    const amount = values[pool.id] ?? 0

    return (
      <div key={pool.id} className="space-y-2 border-b border-border pb-4 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs uppercase tracking-wide text-foreground">
                {pool.label}
              </p>
              {editMode && (
                <button
                  type="button"
                  onClick={() => removePool(pool.id)}
                  className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <PoolMetricsLines pool={pool} />
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : "0%"}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount / 1_000_000}
            onChange={(e) => {
              const next = Math.max(0, parseFloat(e.target.value) || 0) * 1_000_000
              setAmount(pool.id, next)
            }}
            className="flex-1 rounded border border-border bg-background px-2 py-2 font-mono text-xs text-foreground"
          />
          <span className="flex items-center font-mono text-xs text-muted-foreground">M</span>
        </div>
      </div>
    )
  }

  function renderCatalogPool(pool: QuickSwapPool) {
    const stats = poolDisplayStats(pool)

    return (
      <div
        key={pool.id}
        className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-wide text-foreground">{stats.label}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{stats.pair}</p>
          <div className="mt-1">
            <PoolStatsBadges
              tvlUsd={stats.tvlUsd}
              volumeUsd={stats.volumeUsd}
              liquidity={stats.liquidity}
              apy={stats.apy}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => addPool(pool.id)}
          className="shrink-0 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-foreground transition-colors hover:bg-muted"
        >
          Add
        </button>
      </div>
    )
  }

  function renderSetupPool(pool: QuickSwapPool) {
    const amount = values[pool.id] ?? 0
    const enabled = amount > 0
    const showEditor = mode === "auto" || enabled

    return (
      <div key={pool.id} className="space-y-2 border-b border-border pb-4 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {mode === "custom" && (
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => togglePool(pool.id, e.target.checked)}
                  className="h-3.5 w-3.5 accent-foreground"
                />
              )}
              <p className="font-mono text-xs uppercase tracking-wide text-foreground">
                {pool.label}
              </p>
            </div>
            <PoolMetricsLines pool={pool} />
          </div>
          {showEditor && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : "0%"}
            </span>
          )}
        </div>

        {showEditor && (
          <div className="flex gap-2">
            <input
              type="number"
              value={amount / 1_000_000}
              onChange={(e) => {
                const next = Math.max(0, parseFloat(e.target.value) || 0) * 1_000_000
                setAmount(pool.id, next)
              }}
              className="flex-1 rounded border border-border bg-background px-2 py-2 font-mono text-xs text-foreground"
            />
            <span className="flex items-center font-mono text-xs text-muted-foreground">M</span>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <PoolAllocationEditorSkeleton rows={editMode ? 3 : 4} />
  }

  if (error) {
    return (
      <div className="border border-border p-6">
        <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {title}
        </p>
        <p className="font-mono text-xs text-[#ea580c]">{error}</p>
      </div>
    )
  }

  if (pools.length === 0 && activePools.length === 0) {
    return (
      <div className="border border-border p-6">
        <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {title}
        </p>
        <p className="font-mono text-xs text-muted-foreground">No QuickSwap pools available.</p>
      </div>
    )
  }

  const showSort = editMode ? onSortChange : mode === "custom" && onSortChange

  return (
    <div className="relative border border-border p-6">
      {refetching && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/60 backdrop-blur-[1px]" />
      )}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
            {title}
          </p>
          {subtitle && (
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {showSort && (
          <label className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => onSortChange?.(e.target.value as PoolSortField)}
              className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {editMode ? (
        <div className={`space-y-6 ${refetching ? "opacity-60" : ""}`}>
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Your pools ({activePools.length})
            </p>
            {activePools.length === 0 ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                No pools selected yet — add from the catalog below.
              </p>
            ) : (
              <div className="space-y-5">{activePools.map(renderActivePool)}</div>
            )}
          </div>

          <div className="border-t border-border pt-5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Add more pools ({catalogPools.length})
            </p>
            <p className="mb-3 font-mono text-[10px] text-muted-foreground">
              Browse other QuickSwap pools and add them to your strategy.
            </p>
            {catalogPools.length === 0 ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                All available pools are already in your strategy.
              </p>
            ) : refetching ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="space-y-2 border-b border-border py-3 last:border-b-0">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2 w-40" />
                    <Skeleton className="h-2 w-52" />
                  </div>
                ))}
              </div>
            ) : (
              <div>{catalogPools.map(renderCatalogPool)}</div>
            )}
          </div>
        </div>
      ) : (
        <div className={`space-y-5 ${refetching ? "opacity-60" : ""}`}>
          {refetching
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 border-b border-border pb-4 last:border-b-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-2 w-40" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))
            : pools.map(renderSetupPool)}
        </div>
      )}
    </div>
  )
}
