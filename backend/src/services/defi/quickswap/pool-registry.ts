import type { Address } from "viem";
import { isAddress } from "viem";
import { getQuickSwapEnv } from "../../../config/env";
import {
  getQuickSwapBundle,
  getQuickSwapTokenByAddress,
  type QuickSwapSeedPair,
  type QuickSwapToken,
} from "../../../config/quickswap";
import {
  algebraFactoryAbi,
  algebraPoolAbi,
  erc20MinimalAbi,
} from "./abis";
import { getQuickSwapPublicClient } from "./client";
import {
  fetchSubgraphPools,
  type SubgraphPoolEntry,
} from "./subgraph.client";
import type {
  PoolMetrics,
  PoolOnChainState,
  QuickSwapPool,
  QuickSwapPoolToken,
} from "./types";

const ZERO_POOL: Address = "0x0000000000000000000000000000000000000000";

/** Legacy seed slugs — still accepted for saved strategies and smoke scripts. */
export const LEGACY_POOL_IDS = ["usdce-wsomi", "usdce-weth", "wsomi-weth"] as const;

export class QuickSwapNotDeployedError extends Error {
  constructor(chainId: number) {
    super(
      `QuickSwap contracts are not deployed on chain ${chainId}. Use mainnet (5031) for pool discovery.`,
    );
    this.name = "QuickSwapNotDeployedError";
  }
}

type PoolCache = {
  pools: QuickSwapPool[];
  idSet: Set<string>;
  expiresAt: number;
};

let poolCache: PoolCache | null = null;

function assertQuickSwapDeployed(): void {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  if (!contractsDeployed) {
    throw new QuickSwapNotDeployedError(chainId);
  }
}

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
}

function toPoolToken(
  chainId: number,
  address: Address,
  fallback?: { symbol: string; name: string; decimals: number },
): QuickSwapPoolToken {
  const known = getQuickSwapTokenByAddress(chainId, address);
  if (known) {
    return {
      address: known.address,
      symbol: known.symbol,
      name: known.name,
      decimals: known.decimals,
    };
  }
  if (fallback) {
    return {
      address,
      symbol: fallback.symbol,
      name: fallback.name,
      decimals: fallback.decimals,
    };
  }
  return {
    address,
    symbol: address.slice(2, 8),
    name: "Unknown token",
    decimals: 18,
  };
}

export async function getPoolByPair(
  tokenA: Address,
  tokenB: Address,
): Promise<Address | null> {
  assertQuickSwapDeployed();
  const { contracts } = getQuickSwapEnv();
  const client = getQuickSwapPublicClient();

  const pool = await client.readContract({
    address: contracts.algebraFactory,
    abi: algebraFactoryAbi,
    functionName: "poolByPair",
    args: [tokenA, tokenB],
  });

  if (pool.toLowerCase() === ZERO_POOL) {
    return null;
  }
  return pool;
}

export async function getPoolState(poolAddress: Address): Promise<PoolOnChainState> {
  assertQuickSwapDeployed();
  const client = getQuickSwapPublicClient();

  const [token0, token1, globalState, liquidity] = await Promise.all([
    client.readContract({
      address: poolAddress,
      abi: algebraPoolAbi,
      functionName: "token0",
    }),
    client.readContract({
      address: poolAddress,
      abi: algebraPoolAbi,
      functionName: "token1",
    }),
    client.readContract({
      address: poolAddress,
      abi: algebraPoolAbi,
      functionName: "globalState",
    }),
    client.readContract({
      address: poolAddress,
      abi: algebraPoolAbi,
      functionName: "liquidity",
    }),
  ]);

  const [reserve0, reserve1] = await Promise.all([
    client.readContract({
      address: token0,
      abi: erc20MinimalAbi,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
    client.readContract({
      address: token1,
      abi: erc20MinimalAbi,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
  ]);

  const [price, tick, lastFee, , communityFee, unlocked] = globalState;

  return {
    address: poolAddress,
    token0,
    token1,
    globalState: {
      sqrtPriceX96: price.toString(),
      tick: Number(tick),
      lastFee: Number(lastFee),
      communityFee: Number(communityFee),
      unlocked,
    },
    liquidity: liquidity.toString(),
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
  };
}

function stateToMetrics(state: PoolOnChainState): PoolMetrics {
  return {
    sqrtPriceX96: state.globalState.sqrtPriceX96,
    tick: state.globalState.tick,
    liquidity: state.liquidity,
    reserve0: state.reserve0,
    reserve1: state.reserve1,
    lastFee: state.globalState.lastFee,
    token1PerToken0: null,
    token0PerToken1: null,
    priceLabel: null,
    feeTierPercent: null,
    feeApr: null,
    totalValueLockedUsd: null,
    volumeUsd: null,
    lastUpdated: new Date().toISOString(),
  };
}

function metricsFromSubgraph(entry: SubgraphPoolEntry): PoolMetrics {
  return {
    sqrtPriceX96: entry.sqrtPrice,
    tick: 0,
    liquidity: entry.liquidity,
    reserve0: "0",
    reserve1: "0",
    lastFee: 0,
    token1PerToken0: null,
    token0PerToken1: null,
    priceLabel: null,
    feeTierPercent: null,
    feeApr: null,
    totalValueLockedUsd: entry.totalValueLockedUSD,
    volumeUsd: entry.volumeUSD,
    lastUpdated: new Date().toISOString(),
  };
}

function poolLabelFromTokens(token0: QuickSwapPoolToken, token1: QuickSwapPoolToken): string {
  return `${token0.symbol}/${token1.symbol}`;
}

async function buildPoolFromSeed(
  chainId: number,
  seed: QuickSwapSeedPair,
  poolAddress: Address,
): Promise<QuickSwapPool> {
  const state = await getPoolState(poolAddress);
  const token0Meta = toPoolToken(chainId, state.token0);
  const token1Meta = toPoolToken(chainId, state.token1);

  return {
    id: seed.id,
    label: seed.label,
    address: poolAddress,
    token0: token0Meta,
    token1: token1Meta,
    metrics: stateToMetrics(state),
  };
}

function buildPoolFromSubgraph(chainId: number, entry: SubgraphPoolEntry): QuickSwapPool {
  const token0Address = entry.token0.id as Address;
  const token1Address = entry.token1.id as Address;
  const token0 = toPoolToken(chainId, token0Address, entry.token0);
  const token1 = toPoolToken(chainId, token1Address, entry.token1);
  const poolAddress = entry.id as Address;

  return {
    id: normalizeAddress(poolAddress),
    label: poolLabelFromTokens(token0, token1),
    address: poolAddress,
    token0,
    token1,
    metrics: metricsFromSubgraph(entry),
  };
}

function getSeedPairs(): QuickSwapSeedPair[] {
  const { chainId } = getQuickSwapEnv();
  return getQuickSwapBundle(chainId).seedPairs;
}

async function listSeedPools(): Promise<QuickSwapPool[]> {
  const { chainId } = getQuickSwapEnv();
  const seeds = getSeedPairs();
  const pools: QuickSwapPool[] = [];

  for (const seed of seeds) {
    const address = await getPoolByPair(seed.tokenA, seed.tokenB);
    if (!address) {
      continue;
    }
    pools.push(await buildPoolFromSeed(chainId, seed, address));
  }

  return pools;
}

async function discoverPoolsFromSubgraph(): Promise<QuickSwapPool[]> {
  const { chainId } = getQuickSwapEnv();
  const entries = await fetchSubgraphPools();
  return entries.map((entry) => buildPoolFromSubgraph(chainId, entry));
}

function pairKey(tokenA: Address, tokenB: Address): string {
  const [a, b] = [normalizeAddress(tokenA), normalizeAddress(tokenB)].sort();
  return `${a}:${b}`;
}

function seedPairKey(seed: QuickSwapSeedPair): string {
  return pairKey(seed.tokenA, seed.tokenB);
}

function resolveLegacyPool(
  legacyId: string,
  pools: readonly QuickSwapPool[],
): QuickSwapPool | null {
  const seeds = getSeedPairs();
  const seed = seeds.find((entry) => entry.id === legacyId);
  if (!seed) {
    return null;
  }

  const key = seedPairKey(seed);
  const matches = pools.filter(
    (pool) => pairKey(pool.token0.address, pool.token1.address) === key,
  );

  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((best, pool) => {
    const bestTvl = Number(best.metrics.totalValueLockedUsd ?? 0);
    const poolTvl = Number(pool.metrics.totalValueLockedUsd ?? 0);
    return poolTvl > bestTvl ? pool : best;
  });
}

function refreshCache(pools: QuickSwapPool[]): PoolCache {
  const idSet = new Set<string>();
  for (const pool of pools) {
    idSet.add(pool.id);
  }
  for (const legacyId of LEGACY_POOL_IDS) {
    idSet.add(legacyId);
  }

  const { poolDiscoveryCacheTtlMs } = getQuickSwapEnv();
  poolCache = {
    pools,
    idSet,
    expiresAt: Date.now() + poolDiscoveryCacheTtlMs,
  };
  return poolCache;
}

async function loadPools(forceRefresh = false): Promise<PoolCache> {
  if (!forceRefresh && poolCache && Date.now() < poolCache.expiresAt) {
    return poolCache;
  }

  assertQuickSwapDeployed();

  try {
    const pools = await discoverPoolsFromSubgraph();
    if (pools.length > 0) {
      return refreshCache(pools);
    }
  } catch {
    // Fall back to seed pairs when subgraph is unavailable.
  }

  const seedPools = await listSeedPools();
  return refreshCache(seedPools);
}

/**
 * Lists QuickSwap pools discovered from the Ormi subgraph (all indexed pools on Somnia).
 * Falls back to legacy seed pairs if the subgraph is unavailable.
 */
export async function listKnownPools(forceRefresh = false): Promise<QuickSwapPool[]> {
  const cache = await loadPools(forceRefresh);
  return cache.pools;
}

export async function getKnownPoolIdSet(forceRefresh = false): Promise<Set<string>> {
  const cache = await loadPools(forceRefresh);
  return cache.idSet;
}

export async function isKnownPoolId(poolId: string, forceRefresh = false): Promise<boolean> {
  if ((LEGACY_POOL_IDS as readonly string[]).includes(poolId)) {
    return true;
  }
  if (isAddress(poolId)) {
    return (await getKnownPoolIdSet(forceRefresh)).has(normalizeAddress(poolId as Address));
  }
  return false;
}

export async function getKnownPoolById(poolId: string): Promise<QuickSwapPool | null> {
  const pools = await listKnownPools();
  const normalized = poolId.toLowerCase();

  const direct = pools.find((pool) => pool.id === normalized);
  if (direct) {
    return direct;
  }

  if ((LEGACY_POOL_IDS as readonly string[]).includes(poolId)) {
    const legacy = resolveLegacyPool(poolId, pools);
    if (legacy) {
      return { ...legacy, id: poolId, label: legacy.label };
    }

    const seeds = getSeedPairs();
    const seed = seeds.find((entry) => entry.id === poolId);
    if (!seed) {
      return null;
    }
    const address = await getPoolByPair(seed.tokenA, seed.tokenB);
    if (!address) {
      return null;
    }
    const { chainId } = getQuickSwapEnv();
    return buildPoolFromSeed(chainId, seed, address);
  }

  return null;
}

export function listKnownTokens(): QuickSwapToken[] {
  const { chainId } = getQuickSwapEnv();
  return getQuickSwapBundle(chainId).tokens;
}
