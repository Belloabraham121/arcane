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
  /** Human-readable: how many token1 per 1 token0 (pool-metrics.service). */
  token1PerToken0: string | null;
  /** Human-readable: how many token0 per 1 token1. */
  token0PerToken1: string | null;
  /** Swap fee tier as percent (e.g. 0.05 for lastFee 500). */
  feeTierPercent: number | null;
  /** True APR requires volume — subgraph later. */
  feeApr: number | null;
  lastUpdated: string;
};

export type SwapQuote = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountOut: string;
  sqrtPriceX96After: string;
  initializedTicksCrossed: number;
  gasEstimate: string;
  fee: number;
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
