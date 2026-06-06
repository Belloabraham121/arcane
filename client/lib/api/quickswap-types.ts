/** Pool id from backend — subgraph pool address (lowercase) or legacy seed slug. */
export type QuickSwapPoolId = string;

export type QuickSwapPoolToken = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
};

export type PoolMetrics = {
  sqrtPriceX96: string;
  tick: number;
  liquidity: string;
  reserve0: string;
  reserve1: string;
  lastFee: number;
  token1PerToken0: string | null;
  token0PerToken1: string | null;
  priceLabel: string | null;
  feeTierPercent: number | null;
  feeApr: number | null;
  totalValueLockedUsd: string | null;
  volumeUsd: string | null;
  lastUpdated: string;
};

export type QuickSwapPool = {
  id: string;
  label: string;
  address: `0x${string}`;
  token0: QuickSwapPoolToken;
  token1: QuickSwapPoolToken;
  metrics: PoolMetrics;
};

export type SamplePoolQuote = {
  direction: string;
  amountIn: string;
  amountOut: string;
  fee: number;
};

export type EnrichedQuickSwapPool = QuickSwapPool & {
  sampleQuotes: SamplePoolQuote[];
};

export type SwapQuote = {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOut: string;
  sqrtPriceX96After: string;
  initializedTicksCrossed: number;
  gasEstimate: string;
  fee: number;
};

export type QuickSwapChainMeta = {
  chainId: number;
  contractsDeployed: boolean;
};

export type QuickSwapPoolsResponse = QuickSwapChainMeta & {
  pools: QuickSwapPool[];
};

export type QuickSwapPoolDetailResponse = QuickSwapChainMeta & {
  pool: EnrichedQuickSwapPool;
};

export type QuickSwapPoolQuoteResponse = QuickSwapChainMeta & {
  poolId: string;
  quote: SwapQuote;
};
