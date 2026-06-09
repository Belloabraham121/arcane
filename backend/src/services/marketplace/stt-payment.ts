import type { Address, Hash } from "viem";
import { isAddress, isHash } from "viem";
import {
  MARKETPLACE_STT_SCHEME,
  MARKETPLACE_X402_NETWORK,
} from "./constants.js";

export type NativeSttPaymentPayload = {
  x402Version: number;
  scheme: typeof MARKETPLACE_STT_SCHEME;
  network: typeof MARKETPLACE_X402_NETWORK;
  payload: {
    txHash: Hash;
    payer: Address;
  };
};

export function encodeNativeSttPaymentSignature(input: {
  txHash: Hash;
  payer: Address;
}): string {
  const payload: NativeSttPaymentPayload = {
    x402Version: 2,
    scheme: MARKETPLACE_STT_SCHEME,
    network: MARKETPLACE_X402_NETWORK,
    payload: {
      txHash: input.txHash,
      payer: input.payer,
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeNativeSttPaymentSignature(
  header: string,
): NativeSttPaymentPayload | null {
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(json) as NativeSttPaymentPayload;
    if (
      parsed?.scheme !== MARKETPLACE_STT_SCHEME ||
      parsed?.network !== MARKETPLACE_X402_NETWORK ||
      !parsed.payload?.txHash ||
      !parsed.payload?.payer
    ) {
      return null;
    }
    if (!isHash(parsed.payload.txHash) || !isAddress(parsed.payload.payer)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
