import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { findUserById } from "../auth/user.repository.js";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service.js";
import { resolveRiskLimits } from "../agents/risk-controls.service.js";
import { findStrategyByUserId } from "../agents/strategy.repository.js";
import { parseSubAgents } from "../agents/strategy.service.js";
import type { PoolAllocations, SubAgentConfigItem } from "../agents/strategy.types.js";
import type { PoolAllocationDrift } from "../agents/trading.types.js";
import { resolveAllocationMode } from "../agents/trading-recommendations.js";
import { resolveTradingWallet } from "../agents/trading-wallet-context.service.js";
import { getWalletBalances } from "../wallet/token-balance.service.js";
import type { QuickSwapPool } from "../defi/quickswap/types.js";
import type { WalletBalancesResult } from "../wallet/token-balance.service.js";
import type { EffectiveRiskLimits } from "../agents/risk-controls.types.js";

export class MarketplaceContextError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "MarketplaceContextError";
  }
}

export type MarketplaceUserContext = {
  userId: string;
  accountMode: AccountMode;
  walletAddress: Address;
  poolAllocations: PoolAllocations;
  activePoolIds: string[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  poolDrift: PoolAllocationDrift[];
  subAgents: SubAgentConfigItem[];
  riskLimits: EffectiveRiskLimits;
  allocationMode: ReturnType<typeof resolveAllocationMode>;
};

function buildEqualPoolDrift(
  poolAllocations: PoolAllocations,
  pools: QuickSwapPool[],
  activePoolIds: readonly string[],
): PoolAllocationDrift[] {
  const allocationTotal = Object.values(poolAllocations).reduce(
    (sum, value) => sum + value,
    0,
  );
  const equalPercent =
    activePoolIds.length > 0 ? 100 / activePoolIds.length : 0;

  return activePoolIds.map((poolId) => {
    const pool = pools.find((row) => row.id === poolId);
    const targetAmount = poolAllocations[poolId as keyof PoolAllocations] ?? 0;
    const targetPercent =
      allocationTotal > 0 ? (targetAmount / allocationTotal) * 100 : 0;

    return {
      poolId,
      label: pool?.label ?? poolId,
      targetPercent,
      currentPercent: equalPercent,
      driftPercent: equalPercent - targetPercent,
    };
  });
}

export async function loadMarketplaceUserContext(
  userId: string,
  accountModeOverride?: AccountMode,
): Promise<MarketplaceUserContext> {
  const user = await findUserById(userId);
  if (!user) {
    throw new MarketplaceContextError("USER_NOT_FOUND", "User not found", 404);
  }

  const accountMode = accountModeOverride ?? user.accountMode ?? "live";
  const strategy = await findStrategyByUserId(userId, accountMode);
  if (!strategy) {
    throw new MarketplaceContextError(
      "STRATEGY_NOT_FOUND",
      "No agent strategy found",
      404,
    );
  }

  const poolAllocations = Object.fromEntries(
    strategy.poolAllocations.map((row) => [row.poolId, row.amount]),
  ) as PoolAllocations;

  const activePoolIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);

  if (activePoolIds.length === 0) {
    throw new MarketplaceContextError(
      "NO_POOL_ALLOCATIONS",
      "Strategy has no active pool allocations",
      422,
    );
  }

  const { walletAddress } = resolveTradingWallet(user, accountMode);
  const pools = await listPoolsWithMetrics();
  const balances = await getWalletBalances(walletAddress, activePoolIds);
  const subAgents = parseSubAgents(strategy.subAgentConfig) ?? [];
  const riskLimits = resolveRiskLimits(subAgents);
  const poolDrift = buildEqualPoolDrift(
    poolAllocations,
    pools,
    activePoolIds,
  );

  return {
    userId,
    accountMode,
    walletAddress,
    poolAllocations,
    activePoolIds,
    pools,
    balances,
    poolDrift,
    subAgents,
    riskLimits,
    allocationMode: resolveAllocationMode(accountMode),
  };
}
