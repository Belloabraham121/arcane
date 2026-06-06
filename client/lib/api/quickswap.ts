import { apiRequest } from "./client";
import type {
  QuickSwapPoolDetailResponse,
  QuickSwapPoolQuoteResponse,
  QuickSwapPoolsResponse,
} from "./quickswap-types";

export async function fetchPools() {
  return apiRequest<QuickSwapPoolsResponse>("/api/v1/quickswap/pools");
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
