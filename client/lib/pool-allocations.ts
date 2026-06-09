import type { QuickSwapPool } from "@/lib/api/quickswap-types";
import type { PoolAllocations, PoolId } from "@/lib/api/strategy-types";
import {
  formatApyPercent,
  formatOnChainLiquidity,
  formatPoolTvlUsd,
  formatPoolVolumeUsd,
  poolPairLabel,
} from "@/lib/pool-display";
import {
  activeResolvablePoolEntries,
  resolvePoolById,
} from "@/lib/pool-resolve";
import { POOL_LABELS } from "@/lib/strategy-presets";

const ALLOCATION_TOTAL = 105_000_000;

export const POOL_MARKET_COLORS: Record<string, string> = {
  "usdce-wsomi": "bg-purple-500",
  "usdce-weth": "bg-blue-500",
  "wsomi-weth": "bg-green-500",
};

export type PoolMarketRow = {
  id: string;
  name: string;
  pair: string;
  color: string;
  allocated: number;
  value: number;
  feePercent: number | null;
  tvlUsd: string;
  volumeUsd: string;
  liquidity: string;
  apy: string;
  priceHint: string | null;
};

export function buildPoolMarketRows(
  allocations: PoolAllocations | undefined,
  pools: QuickSwapPool[],
  depositAmount: number,
): PoolMarketRow[] {
  const entries = activeResolvablePoolEntries(allocations ?? {}, pools);
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (total === 0) {
    return [];
  }

  return entries.map(([id, amount]) => {
    const pool = resolvePoolById(id, pools)!;
    const allocated = (amount / total) * 100;
    return {
      id,
      name: POOL_LABELS[id] ?? pool?.label ?? id,
      pair: pool ? poolPairLabel(pool) : "—",
      color: POOL_MARKET_COLORS[id] ?? "bg-muted-foreground",
      allocated,
      value: (depositAmount * allocated) / 100,
      feePercent: pool?.metrics.feeTierPercent ?? null,
      tvlUsd: pool ? formatPoolTvlUsd(pool.metrics.totalValueLockedUsd) : "—",
      volumeUsd: pool ? formatPoolVolumeUsd(pool.metrics.volumeUsd) : "—",
      liquidity: pool ? formatOnChainLiquidity(pool.metrics.liquidity) : "—",
      apy: pool ? formatApyPercent(pool.metrics.feeApr) : "—",
      priceHint: pool?.metrics.priceLabel ?? null,
    };
  });
}

export function formatLiquidity(value: string): string {
  const n = BigInt(value || "0");
  if (n === 0n) {
    return "0";
  }
  const units = ["", "K", "M", "B", "T"] as const;
  let scaled = Number(n);
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)}${units[unit]}`;
}

export function defaultAllocationsFromPools(
  pools: QuickSwapPool[],
): PoolAllocations {
  if (pools.length === 0) {
    return {};
  }

  const weights = pools.map((pool) => {
    const liquidity = BigInt(pool.metrics.liquidity || "0");
    return { id: pool.id as PoolId, weight: liquidity > 0n ? liquidity : 1n };
  });

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0n);
  const result: PoolAllocations = {};
  let assigned = 0;

  weights.forEach((item, index) => {
    if (index === weights.length - 1) {
      result[item.id] = ALLOCATION_TOTAL - assigned;
      return;
    }
    const share = Number(
      (item.weight * BigInt(ALLOCATION_TOTAL)) / totalWeight,
    );
    const amount = Math.max(1, Math.round(share));
    result[item.id] = amount;
    assigned += amount;
  });

  return result;
}

/** Map legacy slugs (e.g. usdce-wsomi) to live pool address ids for editor state. */
export function canonicalizePoolAllocations(
  allocations: PoolAllocations,
  pools: readonly QuickSwapPool[],
): PoolAllocations {
  const result: PoolAllocations = {};

  for (const [id, amount] of Object.entries(allocations)) {
    if (amount <= 0) {
      continue;
    }
    const resolved = resolvePoolById(id, pools);
    const key = resolved?.id ?? id;
    result[key] = amount;
  }

  return result;
}

export function mergeStrategyPoolAllocations(
  saved: PoolAllocations | undefined,
  pools: QuickSwapPool[],
  suggested?: PoolAllocations,
): PoolAllocations {
  if (!saved || Object.keys(saved).length === 0) {
    if (suggested && Object.keys(suggested).length > 0) {
      const result: PoolAllocations = {};
      for (const pool of pools) {
        result[pool.id] = suggested[pool.id] ?? 0;
      }
      const hasPositive = Object.values(result).some((amount) => amount > 0);
      if (hasPositive) {
        return canonicalizePoolAllocations(result, pools);
      }
    }
    return canonicalizePoolAllocations(
      defaultAllocationsFromPools(pools),
      pools,
    );
  }

  const merged: PoolAllocations = {};
  for (const pool of pools) {
    merged[pool.id] = saved[pool.id] ?? 0;
  }

  for (const [id, amount] of Object.entries(saved)) {
    if (amount > 0 && merged[id] == null) {
      merged[id] = amount;
    }
  }

  const hasPositive = Object.values(merged).some((amount) => amount > 0);
  if (!hasPositive) {
    return canonicalizePoolAllocations(
      defaultAllocationsFromPools(pools),
      pools,
    );
  }

  return canonicalizePoolAllocations(merged, pools);
}

export function activePoolAllocations(
  values: PoolAllocations,
): PoolAllocations {
  return Object.fromEntries(
    Object.entries(values).filter(([, amount]) => amount > 0),
  ) as PoolAllocations;
}
