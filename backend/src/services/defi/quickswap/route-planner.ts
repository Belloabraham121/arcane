import type { Address } from "viem";
import { getQuickSwapEnv } from "../../../config/env";
import { MAX_SWAP_HOPS } from "./constants";
import { getKnownPoolById, listKnownPools } from "./pool-registry";
import { quoteExactIn, quoteExactInputPath } from "./quote.service";
import {
  buildApprove,
  buildSwapExactIn,
  buildSwapRoute,
} from "./swap.service";
import type {
  EncodedTxCall,
  QuickSwapPool,
  QuotedSwapPath,
  RebalancePlan,
  SwapQuote,
} from "./types";

export class RoutePlannerError extends Error {
  constructor(
    message: string,
    readonly code = "ROUTE_PLANNER_ERROR",
  ) {
    super(message);
    this.name = "RoutePlannerError";
  }
}

type GraphEdge = {
  token: Address;
  poolId: string;
};

export type TokenGraph = {
  edges: Map<string, GraphEdge[]>;
  pools: Map<string, QuickSwapPool>;
};

export type PlanRebalanceOptions = {
  tokenIn?: Address;
  tokenOut?: Address;
  slippageBps?: number;
};

export type FindBestRouteOptions = {
  maxHops?: number;
  pools?: QuickSwapPool[];
};

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
}

function poolTokenAddresses(pool: QuickSwapPool): Address[] {
  return [pool.token0.address, pool.token1.address];
}

function addGraphEdge(
  edges: Map<string, GraphEdge[]>,
  from: Address,
  to: Address,
  poolId: string,
): void {
  const key = normalizeAddress(from);
  const list = edges.get(key) ?? [];
  const exists = list.some(
    (edge) =>
      normalizeAddress(edge.token) === normalizeAddress(to) &&
      edge.poolId === poolId,
  );
  if (!exists) {
    list.push({ token: to, poolId });
    edges.set(key, list);
  }
}

/** Build an undirected token graph from known pools (tokens = nodes, pools = edges). */
export function buildTokenGraph(pools: readonly QuickSwapPool[]): TokenGraph {
  const edges = new Map<string, GraphEdge[]>();
  const poolMap = new Map<string, QuickSwapPool>();

  for (const pool of pools) {
    poolMap.set(pool.id, pool);
    addGraphEdge(edges, pool.token0.address, pool.token1.address, pool.id);
    addGraphEdge(edges, pool.token1.address, pool.token0.address, pool.id);
  }

  return { edges, pools: poolMap };
}

/**
 * Enumerate simple token paths up to `maxHops` swaps (path length ≤ maxHops + 1).
 */
export function findTokenPaths(
  graph: TokenGraph,
  tokenIn: Address,
  tokenOut: Address,
  maxHops: number = MAX_SWAP_HOPS,
): Address[][] {
  const start = normalizeAddress(tokenIn);
  const end = normalizeAddress(tokenOut);

  if (start === end) {
    return [[tokenIn]];
  }

  const paths: Address[][] = [];

  function visit(
    current: Address,
    path: Address[],
    visited: Set<string>,
    hopsRemaining: number,
  ): void {
    if (hopsRemaining === 0) {
      return;
    }

    const neighbors = graph.edges.get(normalizeAddress(current)) ?? [];
    for (const { token: next } of neighbors) {
      const nextKey = normalizeAddress(next);
      if (visited.has(nextKey)) {
        continue;
      }

      const nextPath = [...path, next];
      if (nextKey === end) {
        paths.push(nextPath);
        continue;
      }

      if (hopsRemaining > 1) {
        visited.add(nextKey);
        visit(next, nextPath, visited, hopsRemaining - 1);
        visited.delete(nextKey);
      }
    }
  }

  visit(tokenIn, [tokenIn], new Set([start]), maxHops);
  return paths;
}

export function poolIdsForPath(
  graph: TokenGraph,
  path: readonly Address[],
): string[] {
  const poolIds: string[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!;
    const to = path[i + 1]!;
    const edge = graph.edges
      .get(normalizeAddress(from))
      ?.find((entry) => normalizeAddress(entry.token) === normalizeAddress(to));

    if (!edge) {
      throw new RoutePlannerError(
        `No pool connects ${from} and ${to}`,
        "POOL_EDGE_NOT_FOUND",
      );
    }

    poolIds.push(edge.poolId);
  }

  return poolIds;
}

async function quotePath(
  path: readonly Address[],
  amountIn: bigint,
): Promise<SwapQuote> {
  if (path.length < 2) {
    throw new RoutePlannerError("Quote path requires at least two tokens");
  }

  if (path.length === 2) {
    return quoteExactIn(path[0]!, path[1]!, amountIn);
  }

  return quoteExactInputPath(path, amountIn);
}

/**
 * Quote every candidate path and return the one with the highest `amountOut`.
 */
export async function findBestRoute(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  options?: FindBestRouteOptions,
): Promise<QuotedSwapPath> {
  if (amountIn <= 0n) {
    throw new RoutePlannerError("amountIn must be positive", "INVALID_AMOUNT");
  }

  if (normalizeAddress(tokenIn) === normalizeAddress(tokenOut)) {
    throw new RoutePlannerError(
      "tokenIn and tokenOut are identical — no swap route needed",
      "IDENTICAL_TOKENS",
    );
  }

  const pools = options?.pools ?? (await listKnownPools());
  const graph = buildTokenGraph(pools);
  const maxHops = options?.maxHops ?? MAX_SWAP_HOPS;
  const paths = findTokenPaths(graph, tokenIn, tokenOut, maxHops);

  if (paths.length === 0) {
    throw new RoutePlannerError(
      `No route found from ${tokenIn} to ${tokenOut} within ${maxHops} hops`,
      "ROUTE_NOT_FOUND",
    );
  }

  const quoted = await Promise.all(
    paths.map(async (path) => {
      const quote = await quotePath(path, amountIn);
      return {
        tokens: path,
        hops: path.length - 1,
        poolIds: poolIdsForPath(graph, path),
        quote,
      } satisfies QuotedSwapPath;
    }),
  );

  const best = quoted.reduce((winner, candidate) => {
    const winnerOut = BigInt(winner.quote.amountOut);
    const candidateOut = BigInt(candidate.quote.amountOut);
    return candidateOut > winnerOut ? candidate : winner;
  });

  if (BigInt(best.quote.amountOut) <= 0n) {
    throw new RoutePlannerError(
      "All candidate routes returned zero output",
      "QUOTE_UNAVAILABLE",
    );
  }

  return best;
}

function resolveRebalanceTokens(
  fromPool: QuickSwapPool,
  toPool: QuickSwapPool,
  options?: PlanRebalanceOptions,
): { tokenIn: Address; tokenOut: Address } {
  if (options?.tokenIn && options?.tokenOut) {
    return { tokenIn: options.tokenIn, tokenOut: options.tokenOut };
  }

  const fromTokens = poolTokenAddresses(fromPool);
  const toTokens = poolTokenAddresses(toPool);
  const toSet = new Set(toTokens.map(normalizeAddress));
  const fromSet = new Set(fromTokens.map(normalizeAddress));

  const exclusiveFrom = fromTokens.filter(
    (token) => !toSet.has(normalizeAddress(token)),
  );
  const exclusiveTo = toTokens.filter(
    (token) => !fromSet.has(normalizeAddress(token)),
  );
  const shared = fromTokens.filter((token) =>
    toSet.has(normalizeAddress(token)),
  );

  const tokenIn = options?.tokenIn ?? exclusiveFrom[0] ?? shared[0];
  const tokenOut = options?.tokenOut ?? exclusiveTo[0] ?? shared[0];

  if (!tokenIn || !tokenOut) {
    throw new RoutePlannerError(
      "Unable to resolve rebalance tokens for the given pools",
      "TOKEN_RESOLUTION_FAILED",
    );
  }

  return { tokenIn, tokenOut };
}

function buildSwapFromQuote(
  path: readonly Address[],
  amountIn: bigint,
  recipient: Address,
  quote: SwapQuote,
  slippageBps: number,
) {
  const quotedAmountOut = BigInt(quote.amountOut);

  if (path.length === 2) {
    return buildSwapExactIn(
      path[0]!,
      path[1]!,
      amountIn,
      slippageBps,
      recipient,
      { quotedAmountOut },
    );
  }

  return buildSwapRoute(path, amountIn, slippageBps, recipient, {
    quotedAmountOut,
  });
}

/**
 * Plan a pool-to-pool rebalance swap.
 *
 * Example: `usdce-wsomi` → `usdce-weth` defaults to WSOMI → WETH (shared USDCe stays put).
 */
export async function planRebalance(
  fromPoolId: string,
  toPoolId: string,
  amount: bigint,
  recipient: Address,
  options?: PlanRebalanceOptions,
): Promise<RebalancePlan> {
  if (amount <= 0n) {
    throw new RoutePlannerError("amount must be positive", "INVALID_AMOUNT");
  }

  if (fromPoolId === toPoolId) {
    throw new RoutePlannerError(
      "fromPool and toPool must differ",
      "SAME_POOL",
    );
  }

  const [fromPool, toPool] = await Promise.all([
    getKnownPoolById(fromPoolId),
    getKnownPoolById(toPoolId),
  ]);

  if (!fromPool) {
    throw new RoutePlannerError(
      `Unknown fromPool: ${fromPoolId}`,
      "POOL_NOT_FOUND",
    );
  }
  if (!toPool) {
    throw new RoutePlannerError(
      `Unknown toPool: ${toPoolId}`,
      "POOL_NOT_FOUND",
    );
  }

  const { tokenIn, tokenOut } = resolveRebalanceTokens(fromPool, toPool, options);

  if (normalizeAddress(tokenIn) === normalizeAddress(tokenOut)) {
    return {
      kind: "no_swap",
      fromPoolId,
      toPoolId,
      token: tokenIn,
      amount,
      reason:
        "Source and target pools share the same token — reallocate without swapping",
    };
  }

  const best = await findBestRoute(tokenIn, tokenOut, amount);
  const slippageBps =
    options?.slippageBps ?? getQuickSwapEnv().defaultSlippageBps;
  const swap = buildSwapFromQuote(
    best.tokens,
    amount,
    recipient,
    best.quote,
    slippageBps,
  );
  const approve: EncodedTxCall = buildApprove(tokenIn, swap.router, amount);

  return {
    kind: "swap",
    fromPoolId,
    toPoolId,
    tokenIn,
    tokenOut,
    amountIn: amount,
    path: best.tokens,
    hops: best.hops,
    poolIds: best.poolIds,
    quote: best.quote,
    swap,
    approve,
  };
}
