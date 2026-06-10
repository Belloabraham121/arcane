"use client"

import {
  formatSttWei,
  marketplaceProductLabel,
} from "@/lib/marketplace-display"
import { MarketplaceTxLink } from "@/components/trading/marketplace-tx-link"

export type MarketplaceReceiptData = {
  productId: string
  amountSttWei: string
  txHash?: string | null
  status?: string
  agentId?: string
  agentName?: string
  devBypass?: boolean
  error?: string | null
  productData?: Record<string, unknown> | null
  payerAddress?: string
  correlationId?: string
  createdAt?: string
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

export function MarketplaceReceiptPanel({
  receipt,
  compact = false,
}: {
  receipt: MarketplaceReceiptData
  compact?: boolean
}) {
  const failed = receipt.status === "failed"
  const productDataJson =
    receipt.productData && Object.keys(receipt.productData).length > 0
      ? JSON.stringify(receipt.productData, null, 2)
      : null

  return (
    <div
      className={
        compact
          ? "space-y-3 rounded border border-[#00ff88]/20 bg-[#00ff88]/5 px-3 py-3"
          : "space-y-4"
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="Product">
          <span className="font-mono text-[10px] text-[#00ff88]">
            {marketplaceProductLabel(receipt.productId)}
          </span>
          <code className="ml-2 font-mono text-[9px] text-muted-foreground">
            {receipt.productId}
          </code>
        </DetailRow>

        <DetailRow label="Amount (STT)">
          <span className="font-mono text-[10px] text-foreground">
            {formatSttWei(receipt.amountSttWei)}
          </span>
        </DetailRow>

        {receipt.agentName && (
          <DetailRow label="Sub-agent">
            <span className="font-mono text-[10px] text-foreground">
              {receipt.agentName}
            </span>
            {receipt.agentId && (
              <code className="ml-2 font-mono text-[9px] text-muted-foreground">
                {receipt.agentId}
              </code>
            )}
          </DetailRow>
        )}

        <DetailRow label="Status">
          <span
            className={`font-mono text-[10px] uppercase ${
              failed ? "text-[#ea580c]" : "text-[#00ff88]"
            }`}
          >
            {receipt.status ?? "success"}
          </span>
        </DetailRow>

        <DetailRow label="Payment Tx">
          {receipt.txHash ? (
            <div className="space-y-1">
              <MarketplaceTxLink txHash={receipt.txHash} />
              <code className="block break-all font-mono text-[9px] text-muted-foreground">
                {receipt.txHash}
              </code>
            </div>
          ) : receipt.devBypass ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              Dev bypass — no on-chain tx
            </span>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground/50">
              —
            </span>
          )}
        </DetailRow>

        {receipt.payerAddress && (
          <DetailRow label="Payer">
            <code className="break-all font-mono text-[10px] text-muted-foreground">
              {receipt.payerAddress}
            </code>
          </DetailRow>
        )}

        {receipt.correlationId && (
          <DetailRow label="Correlation">
            <code className="font-mono text-[9px] text-muted-foreground">
              {receipt.correlationId}
            </code>
          </DetailRow>
        )}

        {receipt.createdAt && (
          <DetailRow label="Timestamp">
            <span className="font-mono text-[10px] text-muted-foreground">
              {new Date(receipt.createdAt).toLocaleString()}
            </span>
          </DetailRow>
        )}
      </div>

      {failed && receipt.error && (
        <p className="font-mono text-[10px] text-[#ea580c]">{receipt.error}</p>
      )}

      {productDataJson && (
        <DetailRow label="Raw product response">
          <pre className="max-h-48 overflow-auto rounded border border-border bg-background/80 p-3 font-mono text-[9px] leading-relaxed text-muted-foreground">
            {productDataJson}
          </pre>
        </DetailRow>
      )}
    </div>
  )
}
