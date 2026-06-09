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

/** Legacy live default (500k) and other inflated setup placeholders. */
export const INFLATED_DEPOSIT_THRESHOLD_USD = 100_000;

export function isInflatedManualDeposit(manual: number): boolean {
  return manual >= INFLATED_DEPOSIT_THRESHOLD_USD;
}

function isInflatedStoredBaseline(baseline: number | null | undefined): boolean {
  return baseline != null && baseline >= INFLATED_DEPOSIT_THRESHOLD_USD;
}

function computeBaselineUsd(
  manual: number,
  detected: number | null,
  accountMode?: AccountMode | null,
): number {
  if (accountMode === "demo") {
    if (detected != null && detected > 0) {
      return detected;
    }
    if (manual > 0 && manual < INFLATED_DEPOSIT_THRESHOLD_USD) {
      return manual;
    }
    return DEFAULT_DEMO_DEPOSIT_USD;
  }

  if (accountMode === "live") {
    if (detected != null && detected > 0) {
      return detected;
    }
    if (isInflatedManualDeposit(manual)) {
      return 0;
    }
    return manual > 0 ? manual : 0;
  }

  if (detected == null || detected <= 0) {
    return manual;
  }
  return Math.max(manual, detected);
}

function depositedUsdForDisplay(
  accountMode: AccountMode | null | undefined,
  manualDepositUsd: number,
  detected: number | null,
  baselineUsd: number,
): number {
  if (accountMode === "demo") {
    if (isInflatedManualDeposit(manualDepositUsd)) {
      return detected ?? DEFAULT_DEMO_DEPOSIT_USD;
    }
    return manualDepositUsd;
  }

  if (accountMode === "live") {
    if (baselineUsd > 0) {
      return baselineUsd;
    }
    if (detected != null && detected > 0) {
      return detected;
    }
    if (isInflatedManualDeposit(manualDepositUsd)) {
      return 0;
    }
    return manualDepositUsd;
  }

  return manualDepositUsd;
}

async function resolveTrueWalletBaseline(input: {
  userId: string;
  accountMode: AccountMode;
  storedBaselineUsd: number | null;
  storedDetectedUsd: number | null;
  currentValueUsd: number;
  fallbackUsd: number;
}): Promise<number> {
  const firstSnapshot = await findFirstSnapshot(input.userId, input.accountMode);
  if (firstSnapshot?.totalValueUsd && firstSnapshot.totalValueUsd > 0) {
    return firstSnapshot.totalValueUsd;
  }

  if (
    input.storedDetectedUsd != null &&
    input.storedDetectedUsd > 0 &&
    input.storedDetectedUsd < (input.storedBaselineUsd ?? Infinity)
  ) {
    return input.storedDetectedUsd;
  }

  if (input.currentValueUsd > 0) {
    return input.currentValueUsd;
  }

  return input.fallbackUsd;
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
    isInflatedManualDeposit(input.manualDepositUsd) ||
    isInflatedStoredBaseline(input.storedBaselineUsd);

  if (!inflated) {
    return null;
  }

  const trueBaseline = await resolveTrueWalletBaseline({
    userId: input.userId,
    accountMode: input.accountMode,
    storedBaselineUsd: input.storedBaselineUsd,
    storedDetectedUsd: input.storedDetectedUsd,
    currentValueUsd: input.currentValueUsd,
    fallbackUsd: DEFAULT_DEMO_DEPOSIT_USD,
  });

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

/**
 * Live accounts activated with the legacy 500k placeholder — heal to wallet
 * snapshot baseline so deposited / net earned match on-chain value.
 */
export async function reconcileLiveBaselineIfNeeded(input: {
  userId: string;
  strategyId: string;
  accountMode: AccountMode;
  manualDepositUsd: number;
  storedBaselineUsd: number | null;
  storedDetectedUsd: number | null;
  currentValueUsd: number;
}): Promise<DepositBaseline | null> {
  if (input.accountMode !== "live") {
    return null;
  }

  const inflated =
    isInflatedManualDeposit(input.manualDepositUsd) ||
    isInflatedStoredBaseline(input.storedBaselineUsd);

  const placeholderWithoutFunds =
    input.manualDepositUsd > LIVE_FUNDED_VALUE_THRESHOLD_USD &&
    input.currentValueUsd <= LIVE_FUNDED_VALUE_THRESHOLD_USD &&
    (input.storedBaselineUsd ?? 0) > LIVE_FUNDED_VALUE_THRESHOLD_USD;

  if (!inflated && !placeholderWithoutFunds) {
    return null;
  }

  const trueBaseline = await resolveTrueWalletBaseline({
    userId: input.userId,
    accountMode: input.accountMode,
    storedBaselineUsd: input.storedBaselineUsd,
    storedDetectedUsd: input.storedDetectedUsd,
    currentValueUsd: input.currentValueUsd,
    fallbackUsd: 0,
  });

  const now = new Date();
  await prisma.agentStrategy.update({
    where: { id: input.strategyId },
    data: {
      depositAmount: trueBaseline,
      detectedDepositUsd:
        input.currentValueUsd > 0 ? input.currentValueUsd : trueBaseline,
      baselineUsd: trueBaseline,
      baselineSetAt: now,
    },
  });

  return {
    manualDepositUsd: trueBaseline,
    detectedDepositUsd:
      input.currentValueUsd > 0 ? input.currentValueUsd : trueBaseline,
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
    accountMode === "demo" && isInflatedManualDeposit(manualDepositUsd)
      ? DEFAULT_DEMO_DEPOSIT_USD
      : accountMode === "live" && isInflatedManualDeposit(manualDepositUsd)
        ? 0
        : manualDepositUsd;

  let baselineUsd =
    accountMode === "demo" &&
    isInflatedStoredBaseline(stored?.baselineUsd) &&
    detected != null &&
    detected > 0
      ? detected
      : accountMode === "live" &&
          isInflatedStoredBaseline(stored?.baselineUsd) &&
          detected != null &&
          detected > 0
        ? detected
        : stored?.baselineUsd != null && stored.baselineUsd > 0
          ? isInflatedStoredBaseline(stored.baselineUsd) &&
              accountMode === "live" &&
              detected != null &&
              detected > 0
            ? detected
            : stored.baselineUsd
          : computeBaselineUsd(manualForBaseline, detected, accountMode);

  if (
    accountMode === "live" &&
    isInflatedStoredBaseline(stored?.baselineUsd) &&
    baselineUsd >= INFLATED_DEPOSIT_THRESHOLD_USD &&
    detected != null &&
    detected > 0 &&
    detected < baselineUsd
  ) {
    baselineUsd = detected;
  }

  const manualDisplay = depositedUsdForDisplay(
    accountMode,
    manualDepositUsd,
    detected,
    baselineUsd,
  );

  return {
    manualDepositUsd: manualDisplay,
    detectedDepositUsd: detected,
    baselineUsd,
    baselineSetAt: stored?.baselineSetAt?.toISOString() ?? null,
  };
}

const LIVE_FUNDED_VALUE_THRESHOLD_USD = 1;

/** Live wallet has no meaningful on-chain balance yet. */
export function isLiveAwaitingOnChainDeposit(input: {
  accountMode: AccountMode;
  currentValueUsd: number;
  detectedDepositUsd: number | null;
}): boolean {
  if (input.accountMode !== "live") {
    return false;
  }
  if (input.currentValueUsd > LIVE_FUNDED_VALUE_THRESHOLD_USD) {
    return false;
  }
  if (
    input.detectedDepositUsd != null &&
    input.detectedDepositUsd > LIVE_FUNDED_VALUE_THRESHOLD_USD
  ) {
    return false;
  }
  return true;
}

/** Avoid inflated P&L when live strategy has a placeholder deposit but wallet is empty. */
export function baselineForPortfolioMetrics(
  baseline: DepositBaseline,
  input: {
    accountMode: AccountMode;
    currentValueUsd: number;
  },
): DepositBaseline {
  if (
    !isLiveAwaitingOnChainDeposit({
      accountMode: input.accountMode,
      currentValueUsd: input.currentValueUsd,
      detectedDepositUsd: baseline.detectedDepositUsd,
    })
  ) {
    return baseline;
  }

  return {
    ...baseline,
    manualDepositUsd: 0,
    baselineUsd: 0,
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
    input.accountMode === "demo" && isInflatedManualDeposit(input.manualDepositUsd)
      ? DEFAULT_DEMO_DEPOSIT_USD
      : input.accountMode === "live" && isInflatedManualDeposit(input.manualDepositUsd)
        ? 0
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
      depositAmount: baselineUsd,
      detectedDepositUsd: detected,
      baselineUsd,
      baselineSetAt: strategy.baselineSetAt ?? now,
    },
  });
}
