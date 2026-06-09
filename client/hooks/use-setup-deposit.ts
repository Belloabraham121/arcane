"use client"

import { useEffect } from "react"
import type { AccountMode } from "@/lib/api/profile"
import { fetchDemoPreview } from "@/lib/api/account-mode"
import { fetchPortfolioSummary } from "@/lib/api/portfolio"
import {
  demoDepositFallback,
  strategyDepositForSetup,
} from "@/lib/setup-deposit"

/** Pre-fill deposit display from wallet/portfolio — not a manual live default. */
export function useSetupDeposit(
  accountMode: AccountMode | null,
  setDepositInput: (value: string) => void,
  strategyDeposit?: number,
) {
  useEffect(() => {
    if (accountMode == null) {
      return
    }

    if (accountMode === "demo") {
      const normalized = strategyDepositForSetup(accountMode, strategyDeposit)
      if (normalized != null) {
        setDepositInput(String(normalized))
        return
      }

      let cancelled = false

      async function loadDemoDeposit() {
        const portfolioResult = await fetchPortfolioSummary("demo")
        if (cancelled) {
          return
        }
        if (
          portfolioResult.success &&
          portfolioResult.data &&
          portfolioResult.data.baselineUsd > 0
        ) {
          setDepositInput(String(portfolioResult.data.baselineUsd))
          return
        }

        const previewResult = await fetchDemoPreview()
        if (cancelled) {
          return
        }
        const amount =
          previewResult.success && previewResult.data
            ? previewResult.data.depositAmountUsd
            : demoDepositFallback()
        setDepositInput(String(amount))
      }

      void loadDemoDeposit()

      return () => {
        cancelled = true
      }
    }

    let cancelled = false

    async function loadLiveDeposit() {
      const portfolioResult = await fetchPortfolioSummary("live")
      if (cancelled) {
        return
      }
      const value =
        portfolioResult.success && portfolioResult.data
          ? portfolioResult.data.currentValueUsd
          : 0
      setDepositInput(value > 0 ? String(value) : "0")
    }

    void loadLiveDeposit()

    return () => {
      cancelled = true
    }
  }, [accountMode, setDepositInput, strategyDeposit])
}
