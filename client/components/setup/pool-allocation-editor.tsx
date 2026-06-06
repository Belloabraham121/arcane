import type { PoolSortField, QuickSwapPool } from "@/lib/api/quickswap-types"
import type { PoolAllocations } from "@/lib/api/strategy-types"
import { formatLiquidity } from "@/lib/pool-allocations"

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
  loading?: boolean
  error?: string | null
  title?: string
  subtitle?: string | null
  sort?: PoolSortField
  onSortChange?: (sort: PoolSortField) => void
}

function priceHint(pool: QuickSwapPool): string {
  return pool.metrics.priceLabel ?? "Price unavailable"
}

function formatApy(pool: QuickSwapPool): string | null {
  const apy = pool.metrics.feeApr
  if (apy == null || !Number.isFinite(apy) || apy <= 0) {
    return null
  }
  return `${apy.toFixed(2)}% APR`
}

export function PoolAllocationEditor({
  pools,
  values,
  onChange,
  mode = "auto",
  loading = false,
  error = null,
  title = "QuickSwap pool allocation",
  subtitle = null,
  sort = "liquidity",
  onSortChange,
}: PoolAllocationEditorProps) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)

  function setAmount(poolId: string, amount: number) {
    onChange({ ...values, [poolId]: Math.max(0, amount) })
  }

  function togglePool(poolId: string, enabled: boolean) {
    if (enabled) {
      const fallback = Math.max(1, Math.round(total / Math.max(pools.length, 1)))
      onChange({ ...values, [poolId]: values[poolId] > 0 ? values[poolId] : fallback })
      return
    }
    onChange({ ...values, [poolId]: 0 })
  }

  if (loading) {
    return (
      <div className="border border-border p-6">
        <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {title}
        </p>
        <p className="font-mono text-xs text-muted-foreground">Loading QuickSwap pools…</p>
      </div>
    )
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

  if (pools.length === 0) {
    return (
      <div className="border border-border p-6">
        <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {title}
        </p>
        <p className="font-mono text-xs text-muted-foreground">No QuickSwap pools available.</p>
      </div>
    )
  }

  return (
    <div className="border border-border p-6">
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
        {mode === "custom" && onSortChange && (
          <label className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PoolSortField)}
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
      <div className="space-y-5">
        {pools.map((pool) => {
          const amount = values[pool.id] ?? 0
          const enabled = amount > 0
          const showEditor = mode === "auto" || enabled
          const apyLabel = formatApy(pool)

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
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {pool.token0.symbol}/{pool.token1.symbol} ·{" "}
                    {pool.metrics.feeTierPercent != null
                      ? `${pool.metrics.feeTierPercent}% fee`
                      : apyLabel ?? "fee —"}
                  </p>
                  {apyLabel && pool.metrics.feeTierPercent != null && (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {apyLabel}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {priceHint(pool)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {pool.metrics.totalValueLockedUsd != null
                      ? `TVL $${Number(pool.metrics.totalValueLockedUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : `Liquidity ${formatLiquidity(pool.metrics.liquidity)}`}
                  </p>
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
        })}
      </div>
    </div>
  )
}
