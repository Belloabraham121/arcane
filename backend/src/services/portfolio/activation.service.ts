import type { Address } from "viem";
import { findUserById } from "../auth/user.repository";
import { createLogger } from "../../shared/logger";
import { ensureBaselineOnActivation } from "./baseline.service";
import { capturePortfolioSnapshot } from "./snapshot.service";
import {
  resolvePortfolioRpcMode,
  resolvePortfolioWallet,
} from "./wallet-context.service";

const log = createLogger("portfolio-activation");

export async function handleStrategyActivation(input: {
  userId: string;
  strategyId: string;
  manualDepositUsd: number;
  poolIds: string[];
}): Promise<void> {
  const user = await findUserById(input.userId);
  if (!user) {
    return;
  }

  const resolved = resolvePortfolioWallet(
    user.accountMode,
    user.walletAddress as Address,
  );
  const rpcMode = resolvePortfolioRpcMode(user.accountMode);

  try {
    const snapshot = await capturePortfolioSnapshot({
      userId: input.userId,
      accountMode: user.accountMode,
      walletAddress: resolved.walletAddress,
      poolIds: input.poolIds,
      rpcMode,
    });

    await ensureBaselineOnActivation({
      userId: input.userId,
      strategyId: input.strategyId,
      manualDepositUsd: input.manualDepositUsd,
      detectedDepositUsd: snapshot.totalValueUsd,
    });
  } catch (err) {
    log.warn("Strategy activation portfolio capture failed", {
      userId: input.userId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
