import type { Hash } from "viem";
import { getSomniaAgentEnv, getTradingExecutionEnv } from "../../config/env";
import { createLogger } from "../../shared/logger";
import { getUserAgentAccount } from "../agents/wallet-executor";
import { createAgentRequest } from "./agent-caller";
import { encodeInferStringPayload } from "./payloads";

const log = createLogger("somnia-attestation");

export type SomniaAttestationStatus =
  | "submitted"
  | "success"
  | "failed"
  | "skipped";

export type SomniaAttestation = {
  status: SomniaAttestationStatus;
  requestId: string | null;
  txHash: Hash | null;
  onChainResponse: string | null;
  message: string;
};

/**
 * Submits a minimal Somnia on-chain LLM request for integration proof.
 * Does not wait for validator finalization — the createRequest tx is the showcase.
 */
export async function submitSomniaAttestation(input: {
  userId: string;
  portfolioSummary: string;
}): Promise<SomniaAttestation> {
  const { somniaAttestationEnabled } = getTradingExecutionEnv();
  if (!somniaAttestationEnabled) {
    return {
      status: "skipped",
      requestId: null,
      txHash: null,
      onChainResponse: null,
      message: "Somnia attestation disabled (SOMNIA_ATTESTATION_ENABLED=false)",
    };
  }

  const env = getSomniaAgentEnv();
  const { account } = await getUserAgentAccount(input.userId);

  const payload = encodeInferStringPayload({
    prompt:
      "Reply with exactly one word: verified (no punctuation). This is an on-chain integration attestation.",
    system: [
      "You are the Somnia on-chain LLM inference agent integrated into Arcane.",
      "Portfolio snapshot:",
      input.portfolioSummary.slice(0, 2000),
    ].join("\n"),
    chainOfThought: false,
    allowedValues: ["verified", "pending"],
  });

  try {
    const { requestId, txHash } = await createAgentRequest(account, payload, {
      agentId: env.llmAgentId,
    });

    log.info("Somnia attestation submitted", {
      userId: input.userId,
      requestId: requestId.toString(),
      txHash,
      agentId: env.llmAgentId.toString(),
    });

    return {
      status: "submitted",
      requestId: requestId.toString(),
      txHash,
      onChainResponse: null,
      message:
        "Somnia on-chain LLM agent invoked (createRequest). Result not used for trading decisions.",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Somnia attestation failed";
    log.warn("Somnia attestation failed", { userId: input.userId, detail });

    return {
      status: "failed",
      requestId: null,
      txHash: null,
      onChainResponse: null,
      message: detail,
    };
  }
}
