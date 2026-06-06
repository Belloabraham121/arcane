import type { Address } from "viem";
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
import type {
  PoolMetrics,
  PoolOnChainState,
  QuickSwapPool,
  QuickSwapPoolToken,
} from "./types";

const ZERO_POOL: Address = "0x0000000000000000000000000000000000000000";

export class QuickSwapNotDeployedError extends Error {
  constructor(chainId: number) {
    super(
      `QuickSwap contracts are not deployed on chain ${chainId}. Use mainnet (5031) for pool discovery.`,
    );
    this.name = "QuickSwapNotDeployedError";
  }
}

function assertQuickSwapDeployed(): void {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  if (!contractsDeployed) {
    throw new QuickSwapNotDeployedError(chainId);
  }
}

function toPoolToken(
  chainId: number,
  address: Address,
  fallbackSymbol?: string,
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
  return {
    address,
    symbol: fallbackSymbol ?? address.slice(2, 8),
    name: fallbackSymbol ?? "Unknown token",
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
    lastUpdated: new Date().toISOString(),
  };
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

function getSeedPairs(): QuickSwapSeedPair[] {
  const { chainId } = getQuickSwapEnv();
  return getQuickSwapBundle(chainId).seedPairs;
}

/**
 * Lists QuickSwap pools for known seed pairs (USDCe/WSOMI, USDCe/WETH, WSOMI/WETH).
 * Skips pairs with no deployed pool (factory returns zero address).
 */
export async function listKnownPools(): Promise<QuickSwapPool[]> {
  assertQuickSwapDeployed();
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

export async function getKnownPoolById(poolId: string): Promise<QuickSwapPool | null> {
  const pools = await listKnownPools();
  return pools.find((p) => p.id === poolId) ?? null;
}

export function listKnownTokens(): QuickSwapToken[] {
  const { chainId } = getQuickSwapEnv();
  return getQuickSwapBundle(chainId).tokens;
}
