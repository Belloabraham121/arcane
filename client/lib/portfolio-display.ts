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

  const manual = `$${formatUsd(summary.manualDepositUsd)} manual`
  if (summary.detectedDepositUsd == null || summary.detectedDepositUsd <= 0) {
    return manual
  }
  const detected = `$${formatUsd(summary.detectedDepositUsd)} detected from wallet`
  if (summary.baselineUsd === summary.manualDepositUsd) {
    return `${manual} · ${detected} (using manual)`
  }
  if (summary.baselineUsd === summary.detectedDepositUsd) {
    return `${manual} · ${detected} (using detected)`
  }
  return `${manual} · ${detected} · baseline $${formatUsd(summary.baselineUsd)}`
}
