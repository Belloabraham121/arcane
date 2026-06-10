import { somniaAttestationTxUrl } from "@/lib/somnia-explorer"

type SomniaAttestationTxLinkProps = {
  txHash: string
  className?: string
  label?: string
  showHash?: boolean
}

export function SomniaAttestationTxLink({
  txHash,
  className = "inline-block font-mono text-[10px] text-[#ea580c] hover:underline",
  label = "View attestation on-chain",
  showHash = false,
}: SomniaAttestationTxLinkProps) {
  const short = `${txHash.slice(0, 10)}…${txHash.slice(-6)}`

  return (
    <a
      href={somniaAttestationTxUrl(txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Somnia testnet LLM attestation (ExploreMe)"
    >
      {label} ↗{showHash ? ` · ${short}` : ""}
    </a>
  )
}
