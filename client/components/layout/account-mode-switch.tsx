"use client"

import type { AccountMode } from "@/lib/api/profile"
import { AccountModeSwitchDialog } from "@/components/layout/account-mode-switch-dialog"
import { useAccountModeSwitch } from "@/hooks/use-account-mode-switch"

type AccountModeSwitchProps = {
  onSwitched?: (mode: AccountMode) => void
}

export function AccountModeSwitch({ onSwitched }: AccountModeSwitchProps) {
  const {
    accountMode,
    pendingMode,
    switching,
    error,
    requestSwitch,
    confirmSwitch,
    cancelSwitch,
    liveWalletAddress,
    demoWalletAddress,
  } = useAccountModeSwitch({ onSwitched })

  if (!accountMode) {
    return null
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 border border-border p-0.5">
          {(["demo", "live"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={switching}
              onClick={() => requestSwitch(mode)}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                accountMode === mode
                  ? mode === "demo"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              {switching && pendingMode === mode ? "…" : mode}
            </button>
          ))}
        </div>
        {error && !pendingMode ? (
          <p className="max-w-xs text-right font-mono text-[10px] text-[#ea580c]">
            {error}
          </p>
        ) : null}
      </div>

      <AccountModeSwitchDialog
        open={pendingMode != null}
        targetMode={pendingMode}
        liveWalletAddress={liveWalletAddress}
        demoWalletAddress={demoWalletAddress}
        switching={switching}
        error={pendingMode ? error : null}
        onConfirm={() => void confirmSwitch()}
        onCancel={cancelSwitch}
      />
    </>
  )
}
