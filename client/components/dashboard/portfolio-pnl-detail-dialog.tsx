"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PortfolioSummary } from "@/lib/api/portfolio"
import {
  baselineDepositHint,
  computeReturnSinceActivationPct,
  formatAprLine,
  formatReturnPct,
  formatUsd,
} from "@/lib/portfolio-display"

type PortfolioPnlDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  portfolio: PortfolioSummary | null
}

function MetricRow({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-mono text-sm font-bold ${valueClassName ?? ""}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function PortfolioPnlDetailDialog({
  open,
  onOpenChange,
  portfolio,
}: PortfolioPnlDetailDialogProps) {
  const returnPct =
    portfolio != null
      ? computeReturnSinceActivationPct(
          portfolio.netEarnedUsd,
          portfolio.baselineUsd,
        )
      : null

  const netNegative =
    portfolio != null && portfolio.netEarnedUsd < 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md font-mono">
        <DialogHeader>
          <DialogTitle className="font-pixel text-lg tracking-tight">
            P&L details
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Wallet-valued performance since strategy activation.
          </DialogDescription>
        </DialogHeader>

        {portfolio ? (
          <div className="space-y-1">
            <MetricRow
              label="P&L baseline"
              value={
                portfolio.awaitingOnChainDeposit
                  ? "$0"
                  : `$${formatUsd(portfolio.baselineUsd)}`
              }
              hint={baselineDepositHint(portfolio)}
            />
            <MetricRow
              label="Current value"
              value={`$${formatUsd(portfolio.currentValueUsd, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
            />
            <MetricRow
              label="Net earned"
              value={
                portfolio.awaitingOnChainDeposit
                  ? "—"
                  : `$${formatUsd(portfolio.netEarnedUsd, {
                      maximumFractionDigits: 2,
                    })}`
              }
              valueClassName={netNegative ? "text-red-600" : "text-[#ea580c]"}
            />
            <MetricRow
              label="Return since activation"
              value={formatReturnPct(returnPct)}
              hint="Actual gain or loss vs baseline — not annualized."
              valueClassName={netNegative ? "text-red-600" : "text-[#ea580c]"}
            />
            <MetricRow
              label="Portfolio APR (annualized)"
              value={formatAprLine(
                portfolio.aprSinceActivation,
                portfolio.apr24h,
              )}
              hint="Annualized from time since activation. Capped at −99% to +9,999% for display."
            />
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            Portfolio data is not available.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
