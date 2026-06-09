"use client"

import { useState } from "react"
import type { AccountMode } from "@/lib/api/profile"
import { updateAccountMode } from "@/lib/api/profile"
import { useSession } from "@/providers/session-provider"

type AccountModeSwitchProps = {
  onSwitched?: (mode: AccountMode) => void
}

export function AccountModeSwitch({ onSwitched }: AccountModeSwitchProps) {
  const { accountMode, profile, refreshSession } = useSession()
  const [switching, setSwitching] = useState<AccountMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!accountMode) {
    return null
  }

  async function switchTo(mode: AccountMode) {
    if (mode === accountMode || switching) {
      return
    }

    setError(null)
    setSwitching(mode)

    const needsLiveConfirm =
      accountMode === "demo" && mode === "live"
    const confirmLiveWallet =
      needsLiveConfirm && profile?.liveWalletAddress
        ? window.confirm(
            `Switch to live mainnet?\n\nYour live agent wallet:\n${profile.liveWalletAddress}\n\nDeposit real tokens before trading.`,
          )
        : needsLiveConfirm

    if (needsLiveConfirm && !confirmLiveWallet) {
      setSwitching(null)
      return
    }

    const result = await updateAccountMode(mode, {
      confirmLiveWallet: needsLiveConfirm ? true : undefined,
    })

    setSwitching(null)

    if (!result.success) {
      setError(result.error?.message ?? "Failed to switch account mode")
      return
    }

    await refreshSession()
    onSwitched?.(mode)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1 border border-border p-0.5">
        {(["demo", "live"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={switching != null}
            onClick={() => void switchTo(mode)}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              accountMode === mode
                ? mode === "demo"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground"
            } disabled:opacity-50`}
          >
            {switching === mode ? "…" : mode}
          </button>
        ))}
      </div>
      {error && (
        <p className="max-w-xs text-right font-mono text-[10px] text-[#ea580c]">
          {error}
        </p>
      )}
    </div>
  )
}
