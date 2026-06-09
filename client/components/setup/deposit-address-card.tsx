"use client"

import { useMemo, useState } from "react"
import { Copy, Check, RefreshCw } from "lucide-react"
import type { AccountMode } from "@/lib/api/auth"
import type { WalletTokenBalance } from "@/lib/api/wallet"
import type { SupportedToken } from "@/lib/supported-tokens"
import { WalletBalancesList } from "@/components/setup/wallet-balances-list"

type DepositAddressCardProps = {
  mode: AccountMode
  address: string
  chainLabel?: string | null
  supportedTokens: SupportedToken[]
  balances: WalletTokenBalance[]
  balancesLoading?: boolean
  balancesError?: string | null
  onRefreshBalances?: () => void
  depositAmount: string
  onDepositAmountChange: (value: string) => void
}

export function DepositAddressCard({
  mode,
  address,
  chainLabel,
  supportedTokens,
  balances,
  balancesLoading = false,
  balancesError = null,
  onRefreshBalances,
  depositAmount,
  onDepositAmountChange,
}: DepositAddressCardProps) {
  const [copied, setCopied] = useState(false)
  const isDemo = mode === "demo"

  const visibleBalances = useMemo(() => {
    const tokenAddresses = new Set(
      supportedTokens.map((token) => token.address.toLowerCase()),
    )
    return balances.filter(
      (row) =>
        row.symbol === "SOMI" ||
        (row.address != null && tokenAddresses.has(row.address.toLowerCase())),
    )
  }, [balances, supportedTokens])

  async function copyAddress() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tokenSymbols = supportedTokens.map((t) => t.symbol).join(", ")
  const showNativeHint = supportedTokens.some((t) => t.symbol === "WSOMI")
  const balanceNetworkLabel =
    chainLabel ?? (isDemo ? "Anvil fork (demo)" : "Somnia mainnet")

  return (
    <div className="border border-border p-6 space-y-5">
      <div>
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground mb-2">
          {isDemo ? "Demo wallet — simulation" : "Agent wallet — deposit"}
        </p>
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          {isDemo ? (
            <>
              Shared paper-trading address on the Anvil fork. Balances are
              pre-seeded — no real deposit. Your agent uses the same trading
              tools as live mode.
            </>
          ) : (
            <>
              Send any supported token to this address —{" "}
              <span className="text-foreground">{tokenSymbols}</span>
              {showNativeHint ? ", or native SOMI" : ""}. You only need one
              token; your agent automatically swaps across your selected
              QuickSwap pools. Balances below help auto-detect your deposited
              baseline.
            </>
          )}
        </p>
        {chainLabel && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-amber-600">
            {chainLabel}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 border border-border bg-muted/30 px-4 py-3">
        <code className="flex-1 break-all font-mono text-sm text-foreground">{address}</code>
        <button
          type="button"
          onClick={copyAddress}
          className="flex items-center gap-2 border border-border px-3 py-2 font-mono text-xs uppercase tracking-widest hover:bg-foreground/5"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
            Wallet balance ({balanceNetworkLabel})
          </p>
          {onRefreshBalances && (
            <button
              type="button"
              onClick={onRefreshBalances}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          )}
        </div>

        <WalletBalancesList
          balances={visibleBalances}
          loading={balancesLoading}
          error={balancesError}
          emptyLabel={
            isDemo
              ? "Start Anvil (npm run fork:anvil) to load fork balances, or activate to auto-fund"
              : "Deposit USDCe, WSOMI, WETH, or native SOMI to fund your agent"
          }
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {isDemo
            ? "Simulation deposit (read-only)"
            : "Total deposit (USD estimate)"}
        </label>
        <p className="font-mono text-[10px] text-muted-foreground">
          {isDemo
            ? "Baseline USD for P&L tracking — matches the demo portfolio seed. Adjust pool allocation above; no manual deposit needed."
            : "Enter the approximate USD value you deposited. The agent tracks pool targets from your allocation above and can auto-detect from wallet balances."}
        </p>
        <input
          type="number"
          min={1}
          value={depositAmount}
          onChange={(e) => onDepositAmountChange(e.target.value)}
          readOnly={isDemo}
          className={`w-full border border-border bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:border-foreground ${
            isDemo ? "cursor-not-allowed opacity-80" : ""
          }`}
          placeholder={isDemo ? "1000" : "500000"}
        />
      </div>
    </div>
  )
}
