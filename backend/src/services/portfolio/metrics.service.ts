import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { findUserById } from "../auth/user.repository";
import { findStrategyByUserId } from "../agents/strategy.repository";
import {
  assertTradingRpcHealthy,
  TradingDemoDisabledError,
} from "../agents/trading-wallet-context.service";
import {
  baselineForPortfolioMetrics,
  getDepositBaseline,
  isLiveAwaitingOnChainDeposit,
  reconcileDemoBaselineIfNeeded,
  reconcileLiveBaselineIfNeeded,
} from "./baseline.service";
import { findSnapshotBefore } from "./snapshot.service";
import { valueWallet } from "./valuation.service";
import {
  resolvePortfolioWallet,
  type PortfolioRpcMode,
} from "./wallet-context.service";

export type PortfolioSummary = {
  currentValueUsd: number;
  baselineUsd: number;
  manualDepositUsd: number;
  detectedDepositUsd: number | null;
  /** Live only — true when setup deposit is declared but wallet has no on-chain funds yet. */
  awaitingOnChainDeposit: boolean;
  netEarnedUsd: number;
  aprSinceActivation: number | null;
  apr24h: number | null;
  walletAddress: Address;
  accountMode: AccountMode;
  chainLabel: string;
  unpricedSymbols: string[];
  positions: Awaited<ReturnType<typeof valueWallet>>["positions"];
};

const MS_PER_DAY = 86_400_000;
const APR_MIN = -99;
const APR_MAX = 9_999;

function capApr(value: number): number {
  return Math.max(APR_MIN, Math.min(APR_MAX, value));
}

function computeAprSinceActivation(
  netEarnedUsd: number,
  baselineUsd: number,
  tradingEnabledAt: Date | null,
): number | null {
  if (!tradingEnabledAt || baselineUsd <= 0) {
    return null;
  }

  const days = (Date.now() - tradingEnabledAt.getTime()) / MS_PER_DAY;
  if (days < 1 / 24) {
    return null;
  }

  const returnRatio = netEarnedUsd / baselineUsd;
  return capApr((returnRatio / days) * 365 * 100);
}

function computeApr24h(currentValueUsd: number, value24hAgo: number | null): number | null {
  if (value24hAgo == null || value24hAgo <= 0) {
    return null;
  }

  const dailyReturn = (currentValueUsd - value24hAgo) / value24hAgo;
  return capApr(dailyReturn * 365 * 100);
}

export class PortfolioDemoDisabledError extends Error {
  constructor() {
    super("Demo portfolio reads are disabled (DEMO_TRADING_ENABLED=false)");
    this.name = "PortfolioDemoDisabledError";
  }
}

async function assertDemoRpcHealthy(rpcMode: PortfolioRpcMode): Promise<void> {
  try {
    await assertTradingRpcHealthy(rpcMode);
  } catch (err) {
    if (err instanceof TradingDemoDisabledError) {
      throw new PortfolioDemoDisabledError();
    }
    throw err;
  }
}

export class PortfolioStrategyRequiredError extends Error {
  constructor() {
    super("An active agent strategy is required for portfolio summary");
    this.name = "PortfolioStrategyRequiredError";
  }
}

function activePoolIds(
  poolAllocations: { poolId: string; amount: number }[],
): string[] {
  return poolAllocations
    .filter((row) => row.amount > 0)
    .map((row) => row.poolId);
}

export async function getPortfolioSummary(
  userId: string,
  modeOverride?: AccountMode,
): Promise<PortfolioSummary> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const accountMode = modeOverride ?? user.accountMode;
  const resolved = resolvePortfolioWallet(
    accountMode,
    user.walletAddress as Address,
  );

  await assertDemoRpcHealthy(resolved.rpcMode);

  const strategy = await findStrategyByUserId(userId, accountMode);
  if (!strategy) {
    throw new PortfolioStrategyRequiredError();
  }

  const poolIds = activePoolIds(strategy.poolAllocations);
  const valuation = await valueWallet(
    resolved.walletAddress,
    poolIds,
    resolved.rpcMode,
  );

  let baseline = await getDepositBaseline(
    userId,
    strategy.depositAmount,
    {
      detectedDepositUsd: strategy.detectedDepositUsd,
      baselineUsd: strategy.baselineUsd,
      baselineSetAt: strategy.baselineSetAt,
    },
    accountMode,
  );

  const healed = await reconcileDemoBaselineIfNeeded({
    userId,
    strategyId: strategy.id,
    accountMode,
    manualDepositUsd: strategy.depositAmount,
    storedBaselineUsd: strategy.baselineUsd,
    storedDetectedUsd: strategy.detectedDepositUsd,
    currentValueUsd: valuation.totalValueUsd,
  });
  if (healed) {
    baseline = healed;
  }

  const liveHealed = await reconcileLiveBaselineIfNeeded({
    userId,
    strategyId: strategy.id,
    accountMode,
    manualDepositUsd: strategy.depositAmount,
    storedBaselineUsd: strategy.baselineUsd,
    storedDetectedUsd: strategy.detectedDepositUsd,
    currentValueUsd: valuation.totalValueUsd,
  });
  if (liveHealed) {
    baseline = liveHealed;
  }

  const awaitingOnChainDeposit = isLiveAwaitingOnChainDeposit({
    accountMode,
    currentValueUsd: valuation.totalValueUsd,
    detectedDepositUsd: baseline.detectedDepositUsd,
  });

  baseline = baselineForPortfolioMetrics(baseline, {
    accountMode,
    currentValueUsd: valuation.totalValueUsd,
  });

  const netEarnedUsd = awaitingOnChainDeposit
    ? 0
    : valuation.totalValueUsd - baseline.baselineUsd;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * MS_PER_DAY);
  const snapshot24h = await findSnapshotBefore(
    userId,
    twentyFourHoursAgo,
    accountMode,
  );

  return {
    currentValueUsd: valuation.totalValueUsd,
    baselineUsd: baseline.baselineUsd,
    manualDepositUsd: baseline.manualDepositUsd,
    detectedDepositUsd: baseline.detectedDepositUsd,
    awaitingOnChainDeposit,
    netEarnedUsd,
    aprSinceActivation: computeAprSinceActivation(
      netEarnedUsd,
      baseline.baselineUsd,
      strategy.tradingEnabledAt,
    ),
    apr24h: computeApr24h(
      valuation.totalValueUsd,
      snapshot24h?.totalValueUsd ?? null,
    ),
    walletAddress: resolved.walletAddress,
    accountMode,
    chainLabel: resolved.chainLabel,
    unpricedSymbols: valuation.unpricedSymbols,
    positions: valuation.positions,
  };
}
