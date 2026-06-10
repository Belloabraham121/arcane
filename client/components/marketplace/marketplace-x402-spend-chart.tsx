"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import type { MarketplacePurchaseRecord } from "@/lib/api/marketplace"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatSttWei } from "@/lib/marketplace-display"
import {
  buildSpendBuckets,
  MARKETPLACE_SPEND_RANGE_LABELS,
  summarizeMarketplaceSpend,
  type MarketplaceSpendRange,
} from "@/lib/marketplace-spend-chart"
import { cn } from "@/lib/utils"

const CHART_ACCENT = "#ea580c"

const chartConfig = {
  spendStt: {
    label: "STT spent",
    color: CHART_ACCENT,
  },
} satisfies ChartConfig

const RANGES: MarketplaceSpendRange[] = ["24h", "7d", "30d", "all"]

function formatSttAxis(value: number): string {
  if (value === 0) return "0"
  if (value < 0.0001) return value.toExponential(1)
  if (value < 1) return value.toFixed(4)
  if (value < 100) return value.toFixed(2)
  return value.toFixed(0)
}

type MarketplaceX402SpendChartProps = {
  purchases: MarketplacePurchaseRecord[]
  className?: string
}

export function MarketplaceX402SpendChart({
  purchases,
  className,
}: MarketplaceX402SpendChartProps) {
  const [range, setRange] = useState<MarketplaceSpendRange>("24h")

  const buckets = useMemo(
    () => buildSpendBuckets(purchases, range),
    [purchases, range],
  )

  const summary = useMemo(
    () => summarizeMarketplaceSpend(purchases, range),
    [purchases, range],
  )

  const hasAnySpend = purchases.some((p) => p.status === "success")

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/20 px-4 py-2.5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Marketplace x402 · STT spend
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
            Agent data purchases on Somnia testnet over{" "}
            {MARKETPLACE_SPEND_RANGE_LABELS[range].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors",
                range === r
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-border px-4 py-3 sm:grid-cols-4">
        <SpendStat
          label="Total spend"
          value={formatSttWei(summary.totalSpendWei)}
        />
        <SpendStat
          label="Purchases"
          value={String(summary.purchaseCount)}
        />
        <SpendStat
          label="Avg / purchase"
          value={
            summary.purchaseCount > 0
              ? `${summary.avgSpendStt.toFixed(4)} STT`
              : "—"
          }
        />
        <SpendStat
          label="Peak period"
          value={
            summary.peakBucketLabel && summary.peakSpendStt > 0
              ? `${summary.peakBucketLabel} · ${summary.peakSpendStt.toFixed(4)} STT`
              : "—"
          }
        />
      </div>

      <div className="px-4 py-4">
        {!hasAnySpend ? (
          <div className="flex h-[280px] items-center justify-center px-4 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              No successful x402 marketplace purchases yet. Spend will appear
              here when sub-agents buy pool snapshots or signals.
            </p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[280px] w-full sm:h-[320px]"
          >
            <AreaChart
              data={buckets}
              margin={{ left: 8, right: 16, top: 12, bottom: 4 }}
            >
              <defs>
                <linearGradient id="x402SpendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={formatSttAxis}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as {
                    label: string
                    spendStt: number
                    spendWei: string
                    purchaseCount: number
                  }
                  if (!row) return null
                  return (
                    <div className="rounded-md border border-border bg-background px-3 py-2 shadow-md">
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="font-mono text-xs text-foreground">
                        {formatSttWei(row.spendWei)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {row.purchaseCount} purchase
                        {row.purchaseCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="spendStt"
                stroke={CHART_ACCENT}
                strokeWidth={2}
                fill="url(#x402SpendFill)"
                dot={
                  buckets.length <= 14
                    ? { r: 3, fill: CHART_ACCENT, strokeWidth: 0 }
                    : false
                }
                activeDot={{ r: 5, fill: CHART_ACCENT, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}

function SpendStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xs text-foreground">{value}</p>
    </div>
  )
}
