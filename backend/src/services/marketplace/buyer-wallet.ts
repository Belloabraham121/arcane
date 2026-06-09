import type { Address } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { getSomniaAgentEnv } from "../../config/env.js";
import { somniaAgentChain } from "../../config/somnia-chains.js";
import { getUserAgentAccount } from "../agents/wallet-executor.js";

/** Somnia testnet faucet for STT gas and x402 micropayments. */
export const SOMNIA_TESTNET_FAUCET_URL = "https://testnet.somnia.network";

/**
 * Marketplace x402 buyer uses the user's custodial agent wallet on Somnia testnet.
 * Always resolves the real custodial key — not Anvil fork impersonation.
 */
export async function getMarketplaceBuyerWallet(userId: string): Promise<{
  walletAddress: Address;
  account: Awaited<ReturnType<typeof getUserAgentAccount>>["account"];
}> {
  const { account, walletAddress } = await getUserAgentAccount(userId);
  return { walletAddress, account };
}

export function createMarketplaceTestnetPublicClient() {
  const { rpcHttp } = getSomniaAgentEnv();
  return createPublicClient({
    chain: somniaAgentChain,
    transport: http(rpcHttp),
  });
}

/** Wallet client for signing x402 STT payments on Somnia testnet (50312). */
export async function createMarketplaceBuyerWalletClient(userId: string) {
  const { walletAddress, account } = await getMarketplaceBuyerWallet(userId);
  const { rpcHttp } = getSomniaAgentEnv();
  const client = createWalletClient({
    account,
    chain: somniaAgentChain,
    transport: http(rpcHttp),
  });
  return { walletAddress, account, client };
}

export async function getMarketplaceBuyerSttBalanceWei(
  userId: string,
): Promise<{ walletAddress: Address; balanceSttWei: bigint }> {
  const { walletAddress } = await getMarketplaceBuyerWallet(userId);
  const client = createMarketplaceTestnetPublicClient();
  const balanceSttWei = await client.getBalance({ address: walletAddress });
  return { walletAddress, balanceSttWei };
}
