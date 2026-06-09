"use client"

import { useEffect } from "react"
import type { AccountMode } from "@/lib/api/auth"
import { fetchDemoPreview } from "@/lib/api/account-mode"
import { DEFAULT_DEMO_DEPOSIT_AMOUNT } from "@/lib/api/strategy-types"

/** Pre-fill read-only demo deposit from preview API; live keeps manual entry. */
export function useSetupDeposit(
  accountMode: AccountMode | null,
  setDepositInput: (value: string) => void,
  strategyDeposit?: number,
) {
  useEffect(() => {
    if (accountMode !== "demo") {
      return
    }

    if (strategyDeposit != null && strategyDeposit > 0) {
      setDepositInput(String(strategyDeposit))
      return
    }

    let cancelled = false

    void fetchDemoPreview().then((result) => {
      if (cancelled) {
        return
      }
      const amount =
        result.success && result.data
          ? result.data.depositAmountUsd
          : DEFAULT_DEMO_DEPOSIT_AMOUNT
      setDepositInput(String(amount))
    })

    return () => {
      cancelled = true
    }
  }, [accountMode, setDepositInput, strategyDeposit])
}
