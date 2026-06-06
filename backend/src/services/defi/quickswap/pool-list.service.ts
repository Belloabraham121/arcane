import { getQuickSwapEnv } from "../../../config/env";
import { listPoolsWithMetrics } from "./pool-metrics.service";
import {
  buildLiquidityWeightedAllocations,
  rankPools,
  selectAutoPools,
  sortRankedPools,
  type PoolSortField,
  type RankedPool,
} from "./pool-ranking.service";
import type { QuickSwapPool } from "./types";

export type PoolListContext = "auto" | "custom" | "all";

export type PoolsListMeta = {
  context: PoolListContext;
  sort: PoolSortField;
  total: number;
  selectionCount?: number;
  suggestedAllocations?: Record<string, number>;
};

export type PoolsListResult = {
  pools: QuickSwapPool[];
  meta: PoolsListMeta;
};

function stripRanking(pool: RankedPool): QuickSwapPool {
  return {
    id: pool.id,
    label: pool.label,
    address: pool.address,
    token0: pool.token0,
    token1: pool.token1,
    metrics: pool.metrics,
  };
}

export async function listPoolsForContext(input?: {
  context?: PoolListContext;
  sort?: PoolSortField;
}): Promise<PoolsListResult> {
  const context = input?.context ?? "all";
  const sort = input?.sort ?? (context === "custom" ? "liquidity" : "score");
  const allPools = await listPoolsWithMetrics();
  const ranked = rankPools(allPools);

  if (context === "auto") {
    const env = getQuickSwapEnv();
    const selection = selectAutoPools(ranked, {
      minCount: env.autoPoolMinCount,
      maxCount: env.autoPoolMaxCount,
      minTvlUsd: env.autoPoolMinTvlUsd,
    });
    const pools = selection.pools.map(stripRanking);
    return {
      pools,
      meta: {
        context: "auto",
        sort: "score",
        total: allPools.length,
        selectionCount: selection.selectionCount,
        suggestedAllocations: buildLiquidityWeightedAllocations(pools),
      },
    };
  }

  if (context === "custom") {
    const sorted = sortRankedPools(ranked, sort).map(stripRanking);
    return {
      pools: sorted,
      meta: {
        context: "custom",
        sort,
        total: sorted.length,
      },
    };
  }

  const sorted = sortRankedPools(ranked, sort).map(stripRanking);
  return {
    pools: sorted,
    meta: {
      context: "all",
      sort,
      total: sorted.length,
    },
  };
}
