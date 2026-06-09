import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { prisma } from "../../infrastructure/postgres/client";
import { createLogger } from "../../shared/logger";
import type { WalletValuation } from "./valuation.service";
import { valueWallet } from "./valuation.service";
import type { PortfolioRpcMode } from "./wallet-context.service";

const log = createLogger("portfolio-snapshot");

export type SnapshotBalancesJson = {
  positions: WalletValuation["positions"];
  unpricedSymbols: string[];
};

export async function capturePortfolioSnapshot(input: {
  userId: string;
  accountMode: AccountMode;
  walletAddress: Address;
  poolIds: string[];
  rpcMode: PortfolioRpcMode;
}): Promise<{ id: string; totalValueUsd: number; capturedAt: Date }> {
  const valuation = await valueWallet(
    input.walletAddress,
    input.poolIds,
    input.rpcMode,
  );

  const balancesJson: SnapshotBalancesJson = {
    positions: valuation.positions,
    unpricedSymbols: valuation.unpricedSymbols,
  };

  const row = await prisma.portfolioSnapshot.create({
    data: {
      userId: input.userId,
      accountMode: input.accountMode,
      walletAddress: input.walletAddress,
      totalValueUsd: valuation.totalValueUsd,
      balancesJson,
    },
  });

  return {
    id: row.id,
    totalValueUsd: row.totalValueUsd,
    capturedAt: row.capturedAt,
  };
}

/** Fire-and-forget snapshot — never blocks trading or activation. */
export function schedulePortfolioSnapshot(input: {
  userId: string;
  accountMode: AccountMode;
  walletAddress: Address;
  poolIds: string[];
  rpcMode: PortfolioRpcMode;
}): void {
  void capturePortfolioSnapshot(input).catch((err) => {
    log.warn("Portfolio snapshot failed", {
      userId: input.userId,
      detail: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function findSnapshotNearTime(
  userId: string,
  target: Date,
  toleranceMs: number,
): Promise<{ totalValueUsd: number; capturedAt: Date } | null> {
  const from = new Date(target.getTime() - toleranceMs);
  const to = new Date(target.getTime() + toleranceMs);

  const row = await prisma.portfolioSnapshot.findFirst({
    where: {
      userId,
      capturedAt: { gte: from, lte: to },
    },
    orderBy: { capturedAt: "asc" },
  });

  if (!row) {
    return null;
  }

  return {
    totalValueUsd: row.totalValueUsd,
    capturedAt: row.capturedAt,
  };
}

export async function findSnapshotBefore(
  userId: string,
  before: Date,
): Promise<{ totalValueUsd: number; capturedAt: Date } | null> {
  const row = await prisma.portfolioSnapshot.findFirst({
    where: {
      userId,
      capturedAt: { lte: before },
    },
    orderBy: { capturedAt: "desc" },
  });

  if (!row) {
    return null;
  }

  return {
    totalValueUsd: row.totalValueUsd,
    capturedAt: row.capturedAt,
  };
}

export async function findFirstSnapshot(
  userId: string,
): Promise<{ totalValueUsd: number; capturedAt: Date } | null> {
  const row = await prisma.portfolioSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "asc" },
  });

  if (!row) {
    return null;
  }

  return {
    totalValueUsd: row.totalValueUsd,
    capturedAt: row.capturedAt,
  };
}
