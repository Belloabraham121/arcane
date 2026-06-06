import type { Address } from "viem";

export type QuickSwapPoolToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
};

export type PoolMetrics = {
  /** Algebra `globalState.price` (sqrt price Q64.96) as decimal string. */
  sqrtPriceX96: string;
  tick: number;
  liquidity: string;
  reserve0: string;
  reserve1: string;
  lastFee: number;
  /** Populated when subgraph/indexer is wired (Phase 1.2). */
  feeApr: number | null;
  lastUpdated: string;
};

export type QuickSwapPool = {
  id: string;
  label: string;
  address: Address;
  token0: QuickSwapPoolToken;
  token1: QuickSwapPoolToken;
  metrics: PoolMetrics;
};

/** User pool allocation target (replaces protocol allocation in Phase 2). */
export type PoolAllocation = {
  poolId: string;
  amount: number;
};

export type PoolGlobalState = {
  sqrtPriceX96: string;
  tick: number;
  lastFee: number;
  communityFee: number;
  unlocked: boolean;
};

export type PoolOnChainState = {
  address: Address;
  token0: Address;
  token1: Address;
  globalState: PoolGlobalState;
  liquidity: string;
  reserve0: string;
  reserve1: string;
};
