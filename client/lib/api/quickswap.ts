import { apiRequest } from "./client";
import type {
  FetchPoolsOptions,
  QuickSwapPoolDetailResponse,
  QuickSwapPoolQuoteResponse,
  QuickSwapPoolsResponse,
} from "./quickswap-types";

export async function fetchPools(options?: FetchPoolsOptions) {
  const params = new URLSearchParams();
  if (options?.context) {
    params.set("context", options.context);
  }
  if (options?.sort) {
    params.set("sort", options.sort);
  }
  const query = params.toString();
  const path = query ? `/api/v1/quickswap/pools?${query}` : "/api/v1/quickswap/pools";
  return apiRequest<QuickSwapPoolsResponse>(path);
}

export async function fetchPool(poolId: string) {
  return apiRequest<QuickSwapPoolDetailResponse>(
    `/api/v1/quickswap/pools/${encodeURIComponent(poolId)}`,
  );
}

export type FetchPoolQuoteInput = {
  tokenIn: `0x${string}`;
  /** Amount in smallest token units (wei / base units). */
  amountIn: string | bigint;
};

export async function fetchPoolQuote(poolId: string, input: FetchPoolQuoteInput) {
  const amountIn =
    typeof input.amountIn === "bigint" ? input.amountIn.toString() : input.amountIn;

  const params = new URLSearchParams({
    tokenIn: input.tokenIn,
    amountIn,
  });

  return apiRequest<QuickSwapPoolQuoteResponse>(
    `/api/v1/quickswap/pools/${encodeURIComponent(poolId)}/quote?${params.toString()}`,
  );
}
