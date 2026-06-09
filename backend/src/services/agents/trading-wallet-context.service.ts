import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { getDemoEnv } from "../../config/env";
import { createLogger } from "../../shared/logger";
import { setAgentSigningSession } from "./wallet-executor";
import {
  AnvilForkUnhealthyError,
  assertAnvilForkHealthy,
  ensureDemoAgentGasFunded,
  fundAgentOnFork,
  impersonateAccountOnFork,
  stopImpersonatingOnFork,
} from "../dev/anvil-fork.service";
import { getWalletBalances } from "../wallet/token-balance.service";

const log = createLogger("trading-wallet");
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
  user: { accountMode: AccountMode | null; walletAddress: string },
  modeOverride?: AccountMode,
): ResolvedTradingWallet {
  const accountMode = modeOverride ?? user.accountMode;
  if (!accountMode) {
    throw new Error("Account mode not set — complete onboarding first");
  }
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

/** Seed the shared demo wallet on the fork when it has no token balances yet. */
export async function ensureDemoTradingWalletFunded(input: {
  anvilRpc: string;
  agentAddress: Address;
  depositAmount: number;
  whaleAddress: Address;
  poolIds: string[];
}): Promise<void> {
  await ensureDemoAgentGasFunded(input.anvilRpc, input.agentAddress);

  const balances = await getWalletBalances(input.agentAddress, input.poolIds);
  const hasTokens = balances.balances.some((row) => {
    try {
      return BigInt(row.balance) > 0n;
    } catch {
      return false;
    }
  });

  if (hasTokens) {
    return;
  }

  const funded = await fundAgentOnFork({
    anvilRpc: input.anvilRpc,
    agentAddress: input.agentAddress,
    depositAmount: input.depositAmount,
    whaleAddress: input.whaleAddress,
  });

  log.info("Demo trading wallet funded on fork", {
    agentAddress: input.agentAddress,
    method: funded.method,
    whaleAddress: funded.whaleAddress,
  });
}

/** Impersonate the shared demo wallet so fork swaps sign from the correct address. */
export async function withDemoAgentSigning<T>(
  rpcMode: TradingRpcMode,
  walletAddress: Address,
  fn: () => Promise<T>,
): Promise<T> {
  if (rpcMode === "mainnet") {
    return fn();
  }

  const demoEnv = getDemoEnv();
  setAgentSigningSession({
    mode: "fork_impersonate",
    walletAddress,
  });

  await impersonateAccountOnFork(demoEnv.anvilRpcUrl, walletAddress);

  try {
    return await fn();
  } finally {
    await stopImpersonatingOnFork(demoEnv.anvilRpcUrl, walletAddress);
    setAgentSigningSession(null);
  }
}

export type DemoTradingAvailability = {
  available: boolean;
  reason: string | null;
};

/** Whether scheduled/manual demo cycles may run (env flag + Anvil health). */
export async function getDemoTradingAvailability(): Promise<DemoTradingAvailability> {
  const demoEnv = getDemoEnv();
  if (!demoEnv.tradingEnabled) {
    return {
      available: false,
      reason: "Demo trading is disabled (DEMO_TRADING_ENABLED=false)",
    };
  }

  try {
    await assertAnvilForkHealthy(demoEnv.anvilRpcUrl);
    return { available: true, reason: null };
  } catch (err) {
    const reason =
      err instanceof AnvilForkUnhealthyError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Anvil fork is unavailable";
    return { available: false, reason };
  }
}

export { withPortfolioRpc as withTradingRpc, AnvilForkUnhealthyError };
