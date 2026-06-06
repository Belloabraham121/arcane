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
  /** Best-effort display line, e.g. "1 USDCe ≈ 0.000264 WETH" (quote fallback when sqrt price is stale). */
  priceLabel: string | null;
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

/** Unsigned transaction call data (wallet executor submits in Phase 3.4). */
export type EncodedTxCall = {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
};

export type SwapBuildResult = {
  call: EncodedTxCall;
  router: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  quotedAmountOut?: bigint;
  deadline: bigint;
  /** Present for multihop `exactInput` routes. */
  path?: `0x${string}`;
  tokens?: readonly Address[];
};

export type QuickSwapPool = {
  id: string;
  label: string;
  address: Address;
  token0: QuickSwapPoolToken;
  token1: QuickSwapPoolToken;
  metrics: PoolMetrics;
};

export type QuotedSwapPath = {
  tokens: readonly Address[];
  hops: number;
  poolIds: string[];
  quote: SwapQuote;
};

export type RebalanceNoSwapPlan = {
  kind: "no_swap";
  fromPoolId: string;
  toPoolId: string;
  token: Address;
  amount: bigint;
  reason: string;
};

export type RebalanceSwapPlan = {
  kind: "swap";
  fromPoolId: string;
  toPoolId: string;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  path: readonly Address[];
  hops: number;
  poolIds: string[];
  quote: SwapQuote;
  swap: SwapBuildResult;
  approve: EncodedTxCall;
};

export type RebalancePlan = RebalanceNoSwapPlan | RebalanceSwapPlan;

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
