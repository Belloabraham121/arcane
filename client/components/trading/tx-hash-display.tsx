import type { AccountMode } from "@/lib/api/auth"
import { somniaTxUrl } from "@/lib/somnia-explorer"

type TxHashDisplayProps = {
  txHash: string
  accountMode?: AccountMode | null
  className?: string
}

export function TxHashDisplay({
  txHash,
  accountMode,
  className = "inline-block font-mono text-xs text-[#ea580c] hover:underline",
}: TxHashDisplayProps) {
  const short = `${txHash.slice(0, 10)}…${txHash.slice(-6)}`

  if (accountMode === "demo") {
    return (
      <code
        className="block break-all font-mono text-[10px] text-muted-foreground"
        title="Demo transaction (simulation — not on Somnia mainnet)"
      >
        {txHash}
      </code>
    )
  }

  return (
    <a
      href={somniaTxUrl(txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {short} ↗
    </a>
  )
}
