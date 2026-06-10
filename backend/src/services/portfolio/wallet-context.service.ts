import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { getDemoEnv } from "../../config/env";
import { resetQuickSwapPublicClient } from "../defi/quickswap/client";
import { applyQuickSwapForkRpc } from "../dev/anvil-fork.service";

export type PortfolioRpcMode = "mainnet" | "fork";

export type ResolvedPortfolioWallet = {
  walletAddress: Address;
  accountMode: AccountMode;
  rpcMode: PortfolioRpcMode;
  chainLabel: string;
};

export function resolvePortfolioRpcMode(accountMode: AccountMode): PortfolioRpcMode {
  return accountMode === "demo" ? "fork" : "mainnet";
}

export function resolvePortfolioWallet(
  accountMode: AccountMode,
  liveWalletAddress: Address,
): ResolvedPortfolioWallet {
  const demoEnv = getDemoEnv();
  const rpcMode = resolvePortfolioRpcMode(accountMode);

  return {
    walletAddress: accountMode === "demo" ? demoEnv.agentWallet : liveWalletAddress,
    accountMode,
    rpcMode,
    chainLabel: accountMode === "demo" ? "Anvil fork (demo)" : "Somnia mainnet",
  };
}

/** Temporarily point QuickSwap client at fork RPC for demo reads. */
export async function withPortfolioRpc<T>(
  rpcMode: PortfolioRpcMode,
  fn: () => Promise<T>,
): Promise<T> {
  if (rpcMode === "mainnet") {
    return fn();
  }

  const demoEnv = getDemoEnv();
  const previousRpc = process.env.QUICKSWAP_RPC_HTTP;
  applyQuickSwapForkRpc(demoEnv.anvilRpcUrl);

  try {
    return await fn();
  } finally {
    if (previousRpc) {
      process.env.QUICKSWAP_RPC_HTTP = previousRpc;
    } else {
      delete process.env.QUICKSWAP_RPC_HTTP;
    }
    resetQuickSwapPublicClient();
  }
}
