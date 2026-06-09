import type { AccountMode } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { DEFAULT_DEMO_DEPOSIT_USD } from "../agents/strategy.types";
import { findFirstSnapshot } from "./snapshot.service";

export type DepositBaseline = {
  manualDepositUsd: number;
  detectedDepositUsd: number | null;
  baselineUsd: number;
  baselineSetAt: string | null;
};

function computeBaselineUsd(
  manual: number,
  detected: number | null,
  accountMode?: AccountMode | null,
): number {
  if (accountMode === "demo") {
    if (detected != null && detected > 0) {
      return detected;
    }
    if (manual > 0 && manual < 100_000) {
      return manual;
    }
    return DEFAULT_DEMO_DEPOSIT_USD;
  }

  if (detected == null || detected <= 0) {
    return manual;
  }
  return Math.max(manual, detected);
}

function isInflatedDemoManual(manual: number): boolean {
  return manual >= 100_000;
}

function isInflatedDemoBaseline(baseline: number | null | undefined): boolean {
  return baseline != null && baseline >= 100_000;
}

/**
 * Demo accounts sometimes inherit live DEFAULT_DEPOSIT_AMOUNT (500k) — heal to
 * wallet-valued baseline so P&L matches fork balances.
 */
export async function reconcileDemoBaselineIfNeeded(input: {
  userId: string;
  strategyId: string;
  accountMode: AccountMode;
  manualDepositUsd: number;
  storedBaselineUsd: number | null;
  storedDetectedUsd: number | null;
  currentValueUsd: number;
}): Promise<DepositBaseline | null> {
  if (input.accountMode !== "demo") {
    return null;
  }

  const inflated =
    isInflatedDemoManual(input.manualDepositUsd) ||
    isInflatedDemoBaseline(input.storedBaselineUsd);

  if (!inflated) {
    return null;
  }

  const firstSnapshot = await findFirstSnapshot(input.userId, "demo");
  const trueBaseline =
    firstSnapshot?.totalValueUsd && firstSnapshot.totalValueUsd > 0
      ? firstSnapshot.totalValueUsd
      : input.storedDetectedUsd != null &&
          input.storedDetectedUsd > 0 &&
          input.storedDetectedUsd < (input.storedBaselineUsd ?? Infinity)
        ? input.storedDetectedUsd
        : input.currentValueUsd > 0
          ? input.currentValueUsd
          : DEFAULT_DEMO_DEPOSIT_USD;

  const now = new Date();
  await prisma.agentStrategy.update({
    where: { id: input.strategyId },
    data: {
      depositAmount: trueBaseline,
      detectedDepositUsd: trueBaseline,
      baselineUsd: trueBaseline,
      baselineSetAt: now,
    },
  });

  return {
    manualDepositUsd: trueBaseline,
    detectedDepositUsd: trueBaseline,
    baselineUsd: trueBaseline,
    baselineSetAt: now.toISOString(),
  };
}

export async function getDepositBaseline(
  userId: string,
  manualDepositUsd: number,
  stored?: {
    detectedDepositUsd: number | null;
    baselineUsd: number | null;
    baselineSetAt: Date | null;
  },
  accountMode?: AccountMode | null,
): Promise<DepositBaseline> {
  let detected = stored?.detectedDepositUsd ?? null;

  if (detected == null) {
    const first = await findFirstSnapshot(
      userId,
      accountMode ?? undefined,
    );
    if (first && first.totalValueUsd > 0) {
      detected = first.totalValueUsd;
    }
  }

  const manualForBaseline =
    accountMode === "demo" && isInflatedDemoManual(manualDepositUsd)
      ? DEFAULT_DEMO_DEPOSIT_USD
      : manualDepositUsd;

  let baselineUsd =
    accountMode === "demo" &&
    isInflatedDemoBaseline(stored?.baselineUsd) &&
    detected != null &&
    detected > 0
      ? detected
      : stored?.baselineUsd != null && stored.baselineUsd > 0
        ? stored.baselineUsd
        : computeBaselineUsd(manualForBaseline, detected, accountMode);

  const manualDisplay =
    accountMode === "demo" && isInflatedDemoManual(manualDepositUsd)
      ? detected ?? DEFAULT_DEMO_DEPOSIT_USD
      : manualDepositUsd;

  return {
    manualDepositUsd: manualDisplay,
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
  accountMode?: AccountMode | null;
}): Promise<void> {
  const strategy = await prisma.agentStrategy.findUnique({
    where: { id: input.strategyId },
  });
  if (!strategy) {
    return;
  }

  const manual =
    input.accountMode === "demo" && isInflatedDemoManual(input.manualDepositUsd)
      ? DEFAULT_DEMO_DEPOSIT_USD
      : input.manualDepositUsd;

  const detected =
    strategy.detectedDepositUsd != null && strategy.detectedDepositUsd > 0
      ? strategy.detectedDepositUsd
      : input.detectedDepositUsd;

  const baselineUsd = computeBaselineUsd(
    manual,
    detected,
    input.accountMode ?? null,
  );
  const now = new Date();

  await prisma.agentStrategy.update({
    where: { id: input.strategyId },
    data: {
      depositAmount:
        input.accountMode === "demo" ? baselineUsd : strategy.depositAmount,
      detectedDepositUsd: detected,
      baselineUsd,
      baselineSetAt: strategy.baselineSetAt ?? now,
    },
  });
}
