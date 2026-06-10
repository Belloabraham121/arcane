import type { Address } from "viem";
import { getDemoEnv } from "../../config/env";
import {
  AnvilForkUnhealthyError,
  assertAnvilForkHealthy,
  creditDemoWalletToken,
  type DemoDepositSymbol,
} from "../dev/anvil-fork.service";
import { findUserById } from "../auth/user.repository";
import {
  isUserCycleRunning,
  scheduleTradingCycle,
} from "../agents/trading-runner.service";

export class DemoDepositError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DemoDepositError";
  }
}

export type DemoDepositResult = {
  walletAddress: string;
  symbol: string;
  credited: string;
  formattedBalance: string;
  chainLabel: string;
};

export async function depositToDemoWallet(
  userId: string,
  symbol: DemoDepositSymbol,
  amount: string,
): Promise<DemoDepositResult> {
  const user = await findUserById(userId);
  if (!user) {
    throw new DemoDepositError("USER_NOT_FOUND", "User not found", 404);
  }

  if (user.accountMode !== "demo") {
    throw new DemoDepositError(
      "DEMO_ONLY",
      "Demo deposits are only available for demo accounts",
      403,
    );
  }

  const demoEnv = getDemoEnv();
  if (!demoEnv.tradingEnabled) {
    throw new DemoDepositError(
      "DEMO_DISABLED",
      "Demo deposits are disabled (DEMO_TRADING_ENABLED=false)",
      503,
    );
  }

  try {
    await assertAnvilForkHealthy(demoEnv.anvilRpcUrl);
  } catch (err) {
    if (err instanceof AnvilForkUnhealthyError) {
      throw new DemoDepositError("ANVIL_UNHEALTHY", err.message, 503);
    }
    throw err;
  }

  const walletAddress = demoEnv.agentWallet as Address;
  const credited = await creditDemoWalletToken({
    anvilRpc: demoEnv.anvilRpcUrl,
    walletAddress,
    symbol,
    amount,
  });

  if (!isUserCycleRunning(userId)) {
    scheduleTradingCycle(userId, "deposit");
  }

  return {
    walletAddress,
    ...credited,
    chainLabel: "Anvil fork (demo)",
  };
}
