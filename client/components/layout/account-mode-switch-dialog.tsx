"use client"

import { X } from "lucide-react"
import type { AccountMode } from "@/lib/api/profile"
import { cn } from "@/lib/utils"

type AccountModeSwitchDialogProps = {
  open: boolean
  targetMode: AccountMode | null
  liveWalletAddress?: string | null
  demoWalletAddress?: string | null
  switching?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function AccountModeSwitchDialog({
  open,
  targetMode,
  liveWalletAddress,
  demoWalletAddress,
  switching = false,
  error,
  onConfirm,
  onCancel,
}: AccountModeSwitchDialogProps) {
  if (!open || !targetMode) {
    return null
  }

  const isLive = targetMode === "live"
  const walletAddress = isLive ? liveWalletAddress : demoWalletAddress

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-mode-switch-title"
      onClick={() => {
        if (!switching) {
          onCancel()
        }
      }}
    >
      <div
        className="w-full max-w-md border border-border bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p
              id="account-mode-switch-title"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              {isLive ? "Switch to live" : "Switch to demo"}
            </p>
            <p className="font-mono text-sm text-foreground">
              {isLive
                ? "Trade on Somnia mainnet with real funds."
                : "Return to paper-trading simulation."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={switching}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={cn(
            "mb-4 space-y-3 border px-4 py-3 font-mono text-[11px] leading-relaxed",
            isLive
              ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground"
              : "border-amber-500/30 bg-amber-500/5 text-muted-foreground",
          )}
        >
          {isLive ? (
            <>
              <p>
                Your live agent wallet will sign swaps on Somnia mainnet. Deposit
                real tokens before trading.
              </p>
              {walletAddress ? (
                <p>
                  <span className="text-foreground">Wallet: </span>
                  <code className="break-all text-[10px] text-foreground">
                    {walletAddress}
                  </code>
                  <span className="ml-1 text-[10px]">
                    ({shortenAddress(walletAddress)})
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p>
                Demo mode uses simulated balances and paper trading. No real
                funds are at risk.
              </p>
              {walletAddress ? (
                <p>
                  <span className="text-foreground">Demo wallet: </span>
                  <code className="break-all text-[10px] text-foreground">
                    {walletAddress}
                  </code>
                  <span className="ml-1 text-[10px]">
                    ({shortenAddress(walletAddress)})
                  </span>
                </p>
              ) : null}
            </>
          )}
        </div>

        {error ? (
          <p className="mb-4 font-mono text-[10px] text-[#ea580c]">{error}</p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={switching}
            className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={switching}
            className={cn(
              "px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-white transition-colors disabled:opacity-50",
              isLive
                ? "bg-emerald-600 hover:bg-emerald-600/90"
                : "bg-amber-600 hover:bg-amber-600/90",
            )}
          >
            {switching
              ? "Switching…"
              : isLive
                ? "Yes, switch to live"
                : "Yes, switch to demo"}
          </button>
        </div>
      </div>
    </div>
  )
}
