"use client"

import type { SomniaAttestationSummary } from "@/lib/api/trading"
import { SomniaAttestationTxLink } from "@/components/trading/somnia-attestation-tx-link"

export function SomniaAttestationPanel({
  attestation,
  compact = false,
}: {
  attestation: SomniaAttestationSummary
  compact?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "space-y-2 rounded border border-border bg-muted/10 px-3 py-3"
          : "space-y-3"
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Type
          </p>
          <p className="font-mono text-[10px] text-foreground">
            Somnia on-chain LLM attestation
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Status
          </p>
          <p className="font-mono text-[10px] uppercase text-foreground">
            {attestation.status}
          </p>
        </div>
        {attestation.requestId ? (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Request ID
            </p>
            <p className="font-mono text-[10px] text-foreground">
              #{attestation.requestId}
            </p>
          </div>
        ) : null}
      </div>

      {attestation.message ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {attestation.message}
        </p>
      ) : null}

      {attestation.txHash ? (
        <div className="space-y-1">
          <SomniaAttestationTxLink txHash={attestation.txHash} />
          <code className="block break-all font-mono text-[9px] text-muted-foreground">
            {attestation.txHash}
          </code>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-muted-foreground">
          No on-chain transaction (skipped or pending)
        </p>
      )}
    </div>
  )
}
