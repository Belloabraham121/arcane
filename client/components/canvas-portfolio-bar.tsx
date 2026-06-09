"use client"

import type { PortfolioSummary } from "@/lib/api/portfolio"
import {
  computeReturnSinceActivationPct,
  formatAprLine,
  formatReturnPct,
  formatUsd,
} from "@/lib/portfolio-display"
import { cn } from "@/lib/utils"

type CanvasPortfolioBarProps = {
  portfolio: PortfolioSummary | null
  isDemo?: boolean
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4">
      <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground/70">
        {label}
      </span>
      <span className={cn("text-xs font-bold", valueClassName)}>
        {value}
      </span>
    </div>
  )
}

function SkeletonBlock({ width }: { width: string }) {
  return (
    <div className="animate-pulse rounded bg-muted-foreground/15" style={{ width, height: 12 }} />
  )
}

function SkeletonBar({ isDemo }: { isDemo?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center">
      <div
        className={cn(
          "flex items-center divide-x divide-border/30 rounded-lg border bg-card/85 px-2 py-2.5 font-mono backdrop-blur-md",
          isDemo ? "border-amber-500/20" : "border-border/30",
        )}
      >
        {["Current value", "Baseline", "Net earned", "Return", "APR"].map(
          (label) => (
            <div key={label} className="flex flex-col items-center gap-1 px-4">
              <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground/70">
                {label}
              </span>
              <SkeletonBlock width={label === "APR" ? "80px" : "52px"} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}

export function CanvasPortfolioBar({ portfolio, isDemo }: CanvasPortfolioBarProps) {
  if (!portfolio) {
    return <SkeletonBar isDemo={isDemo} />
  }

  const returnPct = computeReturnSinceActivationPct(
    portfolio.netEarnedUsd,
    portfolio.baselineUsd,
  )
  const netNegative = portfolio.netEarnedUsd < 0

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center">
      <div
        className={cn(
          "flex items-center divide-x divide-border/30 rounded-lg border bg-card/85 px-2 py-2.5 font-mono backdrop-blur-md",
          isDemo
            ? "border-amber-500/20"
            : "border-border/30",
        )}
      >
        <Metric
          label="Current value"
          value={`$${formatUsd(portfolio.currentValueUsd, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />

        <Metric
          label="Baseline"
          value={
            portfolio.awaitingOnChainDeposit
              ? "$0"
              : `$${formatUsd(portfolio.baselineUsd)}`
          }
        />

        <Metric
          label="Net earned"
          value={
            portfolio.awaitingOnChainDeposit
              ? "—"
              : `$${formatUsd(portfolio.netEarnedUsd, {
                  maximumFractionDigits: 2,
                })}`
          }
          valueClassName={netNegative ? "text-red-500" : "text-emerald-500"}
        />

        <Metric
          label="Return"
          value={formatReturnPct(returnPct)}
          valueClassName={netNegative ? "text-red-500" : "text-emerald-500"}
        />

        <Metric
          label="APR"
          value={formatAprLine(
            portfolio.aprSinceActivation,
            portfolio.apr24h,
          )}
        />

        {isDemo && (
          <div className="flex items-center pl-4">
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-amber-600 dark:text-amber-400">
              demo
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
