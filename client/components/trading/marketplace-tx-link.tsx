import { marketplaceTxUrl } from "@/lib/somnia-explorer"

type MarketplaceTxLinkProps = {
  txHash: string
  className?: string
  label?: string
  showHash?: boolean
}

export function MarketplaceTxLink({
  txHash,
  className = "inline-block font-mono text-[10px] text-[#ea580c] hover:underline",
  label = "View transaction on-chain",
  showHash = false,
}: MarketplaceTxLinkProps) {
  const short = `${txHash.slice(0, 10)}…${txHash.slice(-6)}`

  return (
    <a
      href={marketplaceTxUrl(txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Somnia testnet (Shannon explorer)"
    >
      {label} ↗{showHash ? ` · ${short}` : ""}
    </a>
  )
}
