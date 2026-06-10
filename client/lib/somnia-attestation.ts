import type { SomniaAttestationSummary } from "@/lib/api/trading"
import type { TradingActionRecord } from "@/lib/api/trading"

export const SOMNIA_ATTESTATION_TOOL_NAME = "somnia_attestation"

export function isSomniaAttestationAction(action: {
  type: string
  toolName?: string | null
}): boolean {
  return (
    action.type === "tool" &&
    action.toolName === SOMNIA_ATTESTATION_TOOL_NAME
  )
}

export function attestationFromActionMetadata(
  action: TradingActionRecord,
): SomniaAttestationSummary | null {
  if (!isSomniaAttestationAction(action)) {
    return null
  }
  const meta =
    action.metadata && typeof action.metadata === "object"
      ? (action.metadata as Record<string, unknown>)
      : null
  if (!meta) {
    return null
  }
  const status = meta.status
  if (
    status !== "submitted" &&
    status !== "success" &&
    status !== "failed" &&
    status !== "skipped"
  ) {
    return null
  }
  return {
    status,
    requestId: typeof meta.requestId === "string" ? meta.requestId : null,
    txHash:
      typeof meta.txHash === "string"
        ? meta.txHash
        : action.txHash ?? null,
    onChainResponse:
      typeof meta.onChainResponse === "string" ? meta.onChainResponse : null,
    message: typeof meta.message === "string" ? meta.message : "",
  }
}
