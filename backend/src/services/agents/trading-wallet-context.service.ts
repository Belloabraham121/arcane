import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { getDemoEnv } from "../../config/env";
import {
  AnvilForkUnhealthyError,
  assertAnvilForkHealthy,
} from "../dev/anvil-fork.service";
import {
  resolvePortfolioRpcMode,
  resolvePortfolioWallet,
  withPortfolioRpc,
  type PortfolioRpcMode,
  type ResolvedPortfolioWallet,
} from "../portfolio/wallet-context.service";

export type TradingRpcMode = PortfolioRpcMode;
export type ResolvedTradingWallet = ResolvedPortfolioWallet;

/** demo → Anvil fork; live → Somnia mainnet. */
export function resolveTradingRpc(accountMode: AccountMode): TradingRpcMode {
  return resolvePortfolioRpcMode(accountMode);
}

/** demo → `DEMO_AGENT_WALLET`; live → user's custodial agent wallet. */
export function resolveTradingWallet(
  user: { accountMode: AccountMode; walletAddress: string },
  modeOverride?: AccountMode,
): ResolvedTradingWallet {
  const accountMode = modeOverride ?? user.accountMode;
  return resolvePortfolioWallet(accountMode, user.walletAddress as Address);
}

export class TradingDemoDisabledError extends Error {
  constructor() {
    super("Demo trading is disabled (DEMO_TRADING_ENABLED=false)");
    this.name = "TradingDemoDisabledError";
  }
}

/** Refuses demo cycles when disabled or Anvil is unhealthy. */
export async function assertTradingRpcHealthy(rpcMode: TradingRpcMode): Promise<void> {
  if (rpcMode === "mainnet") {
    return;
  }

  const demoEnv = getDemoEnv();
  if (!demoEnv.tradingEnabled) {
    throw new TradingDemoDisabledError();
  }

  await assertAnvilForkHealthy(demoEnv.anvilRpcUrl);
}

export { withPortfolioRpc as withTradingRpc, AnvilForkUnhealthyError };
