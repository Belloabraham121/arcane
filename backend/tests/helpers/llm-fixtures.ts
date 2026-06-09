import type { Address } from "viem";
import { resolveRiskLimits } from "../../src/services/agents/risk-controls.service";
import type { PoolAllocationDrift } from "../../src/services/agents/trading.types";
import type { PoolAllocations } from "../../src/services/agents/strategy.types";
import type { QuickSwapPool } from "../../src/services/defi/quickswap/types";
import type { WalletBalancesResult } from "../../src/services/wallet/token-balance.service";
import { mockQuickSwapPool, mockWalletBalances } from "./fixtures";

export function buildPoolDriftForTest(
  poolId: string,
  pool: QuickSwapPool,
  targetPercent = 100,
  currentPercent = 55,
): PoolAllocationDrift[] {
  return [
    {
      poolId,
      label: pool.label,
      targetPercent,
      currentPercent,
      driftPercent: currentPercent - targetPercent,
    },
  ];
}

export function buildLlmTradingCycleInput(input: {
  userId: string;
  walletAddress: Address;
  poolId: string;
  poolAllocations?: PoolAllocations;
  depositAmount?: number;
  strategyType?: "auto" | "custom";
}) {
  const pool = mockQuickSwapPool(input.poolId);
  const poolAllocations =
    input.poolAllocations ?? ({ [input.poolId]: 105_000_000 } as PoolAllocations);
  const balances = mockWalletBalances(input.walletAddress);

  return {
    userId: input.userId,
    walletAddress: input.walletAddress,
    strategyType: input.strategyType ?? ("custom" as const),
    depositAmount: input.depositAmount ?? 1000,
    lastCycleAt: null,
    poolAllocations,
    poolDrift: buildPoolDriftForTest(input.poolId, pool),
    pools: [pool] as QuickSwapPool[],
    balances: balances as WalletBalancesResult,
    subAgents: [],
    activePoolIds: [input.poolId] as readonly string[],
    riskLimits: resolveRiskLimits([]),
  };
}
