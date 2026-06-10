import type { QuickSwapPool } from "./types";

export type PoolSortField = "liquidity" | "apy" | "tvl" | "volume" | "score";

export type RankedPool = QuickSwapPool & {
  ranking: {
    liquidityScore: number;
    apyPercent: number;
    tvlUsd: number;
    volumeUsd: number;
    compositeScore: number;
  };
};

const FEE_RATE_ASSUME = 0.0005;
const DAYS_PER_YEAR = 365;
const MAX_APY_PERCENT = 500;

export function parseUsdMetric(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseOnChainLiquidity(value: string | null | undefined): bigint {
  try {
    const raw = BigInt(value ?? "0");
    return raw > 0n ? raw : 0n;
  } catch {
    return 0n;
  }
}

/** Pool must have positive TVL, on-chain liquidity, and subgraph volume. */
export function hasCompletePoolMetrics(pool: QuickSwapPool): boolean {
  const tvlUsd = parseUsdMetric(pool.metrics.totalValueLockedUsd);
  const volumeUsd = parseUsdMetric(pool.metrics.volumeUsd);
  const liquidity = parseOnChainLiquidity(pool.metrics.liquidity);
  return tvlUsd > 0 && volumeUsd > 0 && liquidity > 0n;
}

export function filterPoolsWithCompleteMetrics(
  pools: readonly QuickSwapPool[],
): QuickSwapPool[] {
  return pools.filter(hasCompletePoolMetrics);
}

/** Implied fee APR from subgraph cumulative volume and TVL (ranking metric, not audited on-chain APR). */
export function computeFeeAprPercent(pool: QuickSwapPool): number {
  const tvl = parseUsdMetric(pool.metrics.totalValueLockedUsd);
  const volume = parseUsdMetric(pool.metrics.volumeUsd);
  if (tvl < 1 || volume <= 0) {
    return 0;
  }
  const dailyFees = volume * FEE_RATE_ASSUME;
  const apr = (dailyFees / tvl) * DAYS_PER_YEAR * 100;
  return Math.min(apr, MAX_APY_PERCENT);
}

function pairKey(tokenA: string, tokenB: string): string {
  const [a, b] = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort();
  return `${a}:${b}`;
}

/** Keep the highest-scoring pool per unique token pair (avoids four WSOMI/USDCe slots in auto). */
export function dedupePoolsByTokenPair(
  pools: readonly RankedPool[],
): RankedPool[] {
  const byPair = new Map<string, RankedPool>();
  for (const pool of pools) {
    const key = pairKey(pool.token0.address, pool.token1.address);
    const existing = byPair.get(key);
    if (
      !existing ||
      pool.ranking.compositeScore > existing.ranking.compositeScore
    ) {
      byPair.set(key, pool);
    }
  }
  return sortRankedPools([...byPair.values()], "score");
}

/** Prefer TVL USD for ranking; on-chain liquidity bigint overflows JS Number. */
function liquidityNumeric(pool: QuickSwapPool): number {
  const tvl = parseUsdMetric(pool.metrics.totalValueLockedUsd);
  if (tvl > 0) {
    return tvl;
  }
  try {
    const raw = BigInt(pool.metrics.liquidity || "0");
    if (raw <= 0n) {
      return 0;
    }
    const digits = raw.toString().length;
    return Math.pow(10, Math.min(digits - 1, 15));
  } catch {
    return 0;
  }
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) {
    return values.map(() => 0);
  }
  return values.map((value) => value / max);
}

export function rankPools(pools: readonly QuickSwapPool[]): RankedPool[] {
  const liquidities = pools.map(liquidityNumeric);
  const apys = pools.map(computeFeeAprPercent);
  const normLiq = normalize(liquidities);
  const normApy = normalize(apys);

  return pools.map((pool, index) => {
    const tvlUsd = parseUsdMetric(pool.metrics.totalValueLockedUsd);
    const volumeUsd = parseUsdMetric(pool.metrics.volumeUsd);
    const apyPercent = apys[index] ?? 0;
    const liquidityScore = liquidities[index] ?? 0;
    const compositeScore = normLiq[index]! * 0.5 + normApy[index]! * 0.5;

    return {
      ...pool,
      metrics: {
        ...pool.metrics,
        feeApr: apyPercent > 0 ? apyPercent : pool.metrics.feeApr,
      },
      ranking: {
        liquidityScore,
        apyPercent,
        tvlUsd,
        volumeUsd,
        compositeScore,
      },
    };
  });
}

function compareDesc(a: number, b: number): number {
  return b - a;
}

export function sortRankedPools(
  pools: readonly RankedPool[],
  sort: PoolSortField,
): RankedPool[] {
  const sorted = [...pools];
  sorted.sort((a, b) => {
    switch (sort) {
      case "apy":
        return compareDesc(a.ranking.apyPercent, b.ranking.apyPercent);
      case "tvl":
        return compareDesc(a.ranking.tvlUsd, b.ranking.tvlUsd);
      case "volume":
        return compareDesc(a.ranking.volumeUsd, b.ranking.volumeUsd);
      case "score":
        return compareDesc(a.ranking.compositeScore, b.ranking.compositeScore);
      case "liquidity":
      default:
        return compareDesc(a.ranking.liquidityScore, b.ranking.liquidityScore);
    }
  });
  return sorted;
}

export function pickAutoPoolCount(min: number, max: number): number {
  const low = Math.max(1, Math.min(min, max));
  const high = Math.max(low, max);
  if (low === high) {
    return low;
  }
  return Math.random() < 0.5 ? low : high;
}

export type AutoPoolSelection = {
  pools: RankedPool[];
  selectionCount: number;
  candidateCount: number;
};

export function selectAutoPools(
  pools: readonly QuickSwapPool[],
  options?: {
    minCount?: number;
    maxCount?: number;
    minTvlUsd?: number;
    candidateLimit?: number;
  },
): AutoPoolSelection {
  const minCount = options?.minCount ?? 3;
  const maxCount = options?.maxCount ?? 4;
  const minTvlUsd = options?.minTvlUsd ?? 0.01;
  const candidateLimit = options?.candidateLimit ?? 8;

  const eligible = rankPools(pools).filter(
    (pool) => pool.ranking.tvlUsd >= minTvlUsd,
  );
  const ranked = dedupePoolsByTokenPair(eligible);
  const selectionCount = pickAutoPoolCount(minCount, maxCount);
  const selected = ranked.slice(0, Math.min(selectionCount, ranked.length));

  return {
    pools: selected,
    selectionCount: selected.length,
    candidateCount: ranked.length,
  };
}

const ALLOCATION_TOTAL = 105_000_000;

export function buildLiquidityWeightedAllocations(
  pools: readonly QuickSwapPool[],
): Record<string, number> {
  if (pools.length === 0) {
    return {};
  }

  const weights = pools.map((pool) => {
    const liquidity = liquidityNumeric(pool);
    const tvl = parseUsdMetric(pool.metrics.totalValueLockedUsd);
    const weight = liquidity > 0 ? liquidity : tvl > 0 ? tvl : 1;
    return { id: pool.id, weight };
  });

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const result: Record<string, number> = {};
  let assigned = 0;

  weights.forEach((item, index) => {
    if (index === weights.length - 1) {
      result[item.id] = ALLOCATION_TOTAL - assigned;
      return;
    }
    const share = Math.round((item.weight / totalWeight) * ALLOCATION_TOTAL);
    const amount = Math.max(1, share);
    result[item.id] = amount;
    assigned += amount;
  });

  return result;
}
