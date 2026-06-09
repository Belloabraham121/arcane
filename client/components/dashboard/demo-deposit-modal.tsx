"use client"

import { useState } from "react"
import { X } from "lucide-react"
import {
  depositDemoTokens,
  type DemoDepositSymbol,
} from "@/lib/api/demo-deposit"

const TOKENS: { symbol: DemoDepositSymbol; label: string; hint: string }[] = [
  { symbol: "USDCe", label: "USDCe", hint: "Stablecoin (~$1 via CoinGecko)" },
  { symbol: "WSOMI", label: "WSOMI", hint: "Wrapped SOMI (CoinGecko price)" },
  { symbol: "WETH", label: "WETH", hint: "Wrapped ETH" },
  { symbol: "SOMI", label: "SOMI", hint: "Native gas token on fork" },
]

type DemoDepositModalProps = {
  open: boolean
  walletAddress: string | null
  onClose: () => void
  onDeposited: () => void
}

export function DemoDepositModal({
  open,
  walletAddress,
  onClose,
  onDeposited,
}: DemoDepositModalProps) {
  const [symbol, setSymbol] = useState<DemoDepositSymbol>("USDCe")
  const [amount, setAmount] = useState("1000")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!open) {
    return null
  }

  async function handleDeposit() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const result = await depositDemoTokens(symbol, amount)
    setSaving(false)

    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to credit demo wallet")
      return
    }

    setSuccess(
      `Credited ${result.data.credited} ${result.data.symbol}. New balance: ${result.data.formattedBalance}`,
    )
    onDeposited()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md border border-border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Demo wallet deposit
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Credit tokens on the Anvil fork — paper money only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {walletAddress && (
          <code className="mb-4 block break-all font-mono text-[10px] text-muted-foreground">
            {walletAddress}
          </code>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Token
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as DemoDepositSymbol)}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
            >
              {TOKENS.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.label}
                </option>
              ))}
            </select>
            <p className="font-mono text-[10px] text-muted-foreground">
              {TOKENS.find((t) => t.symbol === symbol)?.hint}
            </p>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Amount
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder="1000"
            />
          </div>

          {error && (
            <p className="font-mono text-xs text-[#ea580c]">{error}</p>
          )}
          {success && (
            <p className="font-mono text-xs text-emerald-600">{success}</p>
          )}

          <button
            type="button"
            disabled={saving || !amount}
            onClick={() => void handleDeposit()}
            className="w-full bg-foreground px-4 py-3 font-mono text-xs uppercase tracking-widest text-background disabled:opacity-50"
          >
            {saving ? "Crediting…" : "Credit demo tokens"}
          </button>
        </div>
      </div>
    </div>
  )
}
