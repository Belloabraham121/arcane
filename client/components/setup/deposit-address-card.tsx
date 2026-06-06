"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"

type DepositAddressCardProps = {
  address: string
  depositAmount: string
  onDepositAmountChange: (value: string) => void
}

export function DepositAddressCard({
  address,
  depositAmount,
  onDepositAmountChange,
}: DepositAddressCardProps) {
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-border p-6 space-y-5">
      <div>
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground mb-2">
          Your deposit address
        </p>
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          Send USDC to this address generated for your account. Enter the amount you
          deposited below to continue.
        </p>
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

      <div className="space-y-2">
        <label className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Deposited amount (USDC)
        </label>
        <input
          type="number"
          min={1}
          value={depositAmount}
          onChange={(e) => onDepositAmountChange(e.target.value)}
          className="w-full border border-border bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:border-foreground"
          placeholder="500000"
        />
      </div>
    </div>
  )
}
