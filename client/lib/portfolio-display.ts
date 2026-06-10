import type { PortfolioSummary } from "@/lib/api/portfolio"

export function formatUsd(
  value: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  })
}

/** Actual P&L return since activation — not annualized. */
export function computeReturnSinceActivationPct(
  netEarnedUsd: number,
  baselineUsd: number,
): number | null {
  if (!Number.isFinite(baselineUsd) || baselineUsd <= 0) {
    return null
  }
  return (netEarnedUsd / baselineUsd) * 100
}

export function formatReturnPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—"
  }
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

export function formatAprLine(
  aprSinceActivation: number | null,
  apr24h: number | null,
): string {
  const since =
    aprSinceActivation != null ? `${aprSinceActivation.toFixed(1)}%` : "—"
  const day = apr24h != null ? `${apr24h.toFixed(1)}%` : "—"
  return `${since} (24h: ${day})`
}

export function baselineDepositHint(summary: PortfolioSummary): string {
  if (summary.accountMode === "demo") {
    return `Demo baseline from fork wallet value (CoinGecko-priced) — $${formatUsd(summary.baselineUsd)}`
  }

  if (summary.awaitingOnChainDeposit) {
    return "No funds detected on Somnia mainnet yet — deposit to your agent wallet to start"
  }

  if (summary.detectedDepositUsd != null && summary.detectedDepositUsd > 0) {
    return `Wallet balance at activation — $${formatUsd(summary.baselineUsd)} (current on-chain: $${formatUsd(summary.currentValueUsd)})`
  }

  return `Wallet balance at activation — $${formatUsd(summary.baselineUsd)}`
}
