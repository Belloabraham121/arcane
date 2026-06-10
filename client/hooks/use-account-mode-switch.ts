"use client"

import { useCallback, useState } from "react"
import type { AccountMode } from "@/lib/api/profile"
import { updateAccountMode } from "@/lib/api/profile"
import { useSession } from "@/providers/session-provider"

type UseAccountModeSwitchOptions = {
  onSwitched?: (mode: AccountMode) => void | Promise<void>
}

export function useAccountModeSwitch(options?: UseAccountModeSwitchOptions) {
  const { accountMode, profile, refreshSession } = useSession()
  const [pendingMode, setPendingMode] = useState<AccountMode | null>(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestSwitch = useCallback(
    (mode: AccountMode) => {
      if (!accountMode || mode === accountMode || switching) {
        return false
      }
      setError(null)
      setPendingMode(mode)
      return true
    },
    [accountMode, switching],
  )

  const cancelSwitch = useCallback(() => {
    if (switching) {
      return
    }
    setPendingMode(null)
    setError(null)
  }, [switching])

  const confirmSwitch = useCallback(async (): Promise<AccountMode | null> => {
    if (!pendingMode || !accountMode || switching) {
      return null
    }

    setSwitching(true)
    setError(null)

    const needsLiveConfirm = accountMode === "demo" && pendingMode === "live"
    const result = await updateAccountMode(pendingMode, {
      confirmLiveWallet: needsLiveConfirm ? true : undefined,
    })

    if (!result.success) {
      setSwitching(false)
      setError(result.error?.message ?? "Failed to switch account mode")
      return null
    }

    await refreshSession()
    const switched = pendingMode
    setPendingMode(null)
    setSwitching(false)
    await options?.onSwitched?.(switched)
    return switched
  }, [accountMode, options, pendingMode, refreshSession, switching])

  return {
    accountMode,
    pendingMode,
    switching,
    error,
    requestSwitch,
    confirmSwitch,
    cancelSwitch,
    liveWalletAddress: profile?.liveWalletAddress ?? null,
    demoWalletAddress: profile?.demoWalletAddress ?? null,
  }
}
