import { createPublicClient, http, type PublicClient } from "viem";
import { getQuickSwapEnv } from "../../../config/env";
import { somniaMainnetChain } from "../../../config/somnia-chain";

let cachedClient: PublicClient | null = null;

export function getQuickSwapPublicClient(): PublicClient {
  if (!cachedClient) {
    const { rpcHttp } = getQuickSwapEnv();
    cachedClient = createPublicClient({
      chain: somniaMainnetChain,
      transport: http(rpcHttp),
    });
  }
  return cachedClient;
}

/** Reset cached client (tests). */
export function resetQuickSwapPublicClient(): void {
  cachedClient = null;
}
