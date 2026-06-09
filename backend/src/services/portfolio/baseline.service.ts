import { prisma } from "../../infrastructure/postgres/client";
import { findFirstSnapshot } from "./snapshot.service";

export type DepositBaseline = {
  manualDepositUsd: number;
  detectedDepositUsd: number | null;
  baselineUsd: number;
  baselineSetAt: string | null;
};

function computeBaselineUsd(manual: number, detected: number | null): number {
  if (detected == null || detected <= 0) {
    return manual;
  }
  return Math.max(manual, detected);
}

export async function getDepositBaseline(
  userId: string,
  manualDepositUsd: number,
  stored?: {
    detectedDepositUsd: number | null;
    baselineUsd: number | null;
    baselineSetAt: Date | null;
  },
): Promise<DepositBaseline> {
  let detected = stored?.detectedDepositUsd ?? null;

  if (detected == null) {
    const first = await findFirstSnapshot(userId);
    if (first && first.totalValueUsd > 0) {
      detected = first.totalValueUsd;
    }
  }

  const baselineUsd =
    stored?.baselineUsd != null && stored.baselineUsd > 0
      ? stored.baselineUsd
      : computeBaselineUsd(manualDepositUsd, detected);

  return {
    manualDepositUsd,
    detectedDepositUsd: detected,
    baselineUsd,
    baselineSetAt: stored?.baselineSetAt?.toISOString() ?? null,
  };
}

export async function ensureBaselineOnActivation(input: {
  userId: string;
  strategyId: string;
  manualDepositUsd: number;
  detectedDepositUsd: number;
}): Promise<void> {
  const strategy = await prisma.agentStrategy.findUnique({
    where: { id: input.strategyId },
  });
  if (!strategy) {
    return;
  }

  const detected =
    strategy.detectedDepositUsd != null && strategy.detectedDepositUsd > 0
      ? strategy.detectedDepositUsd
      : input.detectedDepositUsd;

  const baselineUsd = computeBaselineUsd(input.manualDepositUsd, detected);
  const now = new Date();

  await prisma.agentStrategy.update({
    where: { id: input.strategyId },
    data: {
      detectedDepositUsd: detected,
      baselineUsd,
      baselineSetAt: strategy.baselineSetAt ?? now,
    },
  });
}
