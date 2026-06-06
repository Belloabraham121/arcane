import type { WalletTokenBalance } from "@/lib/api/wallet"

type WalletBalancesListProps = {
  balances: WalletTokenBalance[]
  loading?: boolean
  error?: string | null
  emptyLabel?: string
}

export function WalletBalancesList({
  balances,
  loading = false,
  error = null,
  emptyLabel = "No balances yet",
}: WalletBalancesListProps) {
  if (error) {
    return <p className="font-mono text-xs text-[#ea580c]">{error}</p>
  }

  if (loading && balances.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">Loading balances…</p>
  }

  if (balances.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2">
      {balances.map((row) => (
        <div
          key={`${row.symbol}-${row.address ?? "native"}`}
          className="flex items-center justify-between gap-3 border border-border px-3 py-2"
        >
          <div>
            <p className="font-mono text-xs text-foreground">{row.symbol}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{row.name}</p>
          </div>
          <p className="font-mono text-xs text-foreground">{row.formatted}</p>
        </div>
      ))}
    </div>
  )
}
