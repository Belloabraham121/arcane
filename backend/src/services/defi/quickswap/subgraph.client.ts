import { getQuickSwapEnv } from "../../../config/env";

export type SubgraphPoolToken = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
};

export type SubgraphPoolEntry = {
  id: string;
  liquidity: string;
  sqrtPrice: string;
  totalValueLockedUSD: string;
  volumeUSD: string;
  token0: SubgraphPoolToken;
  token1: SubgraphPoolToken;
};

type PoolsQueryResult = {
  data?: {
    pools?: SubgraphPoolEntry[];
  };
  errors?: Array<{ message: string }>;
};

const POOLS_QUERY = `
  query QuickSwapPools($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gte: $minTvl }
    ) {
      id
      liquidity
      sqrtPrice
      totalValueLockedUSD
      volumeUSD
      token0 {
        id
        symbol
        name
        decimals
      }
      token1 {
        id
        symbol
        name
        decimals
      }
    }
  }
`;

export class QuickSwapSubgraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickSwapSubgraphError";
  }
}

export async function fetchSubgraphPools(options?: {
  minTvlUsd?: number;
  pageSize?: number;
}): Promise<SubgraphPoolEntry[]> {
  const { subgraphUrl, minPoolTvlUsd } = getQuickSwapEnv();
  const minTvl = options?.minTvlUsd ?? minPoolTvlUsd;
  const pageSize = options?.pageSize ?? 100;
  const pools: SubgraphPoolEntry[] = [];
  let skip = 0;

  for (;;) {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: POOLS_QUERY,
        variables: {
          first: pageSize,
          skip,
          minTvl: String(minTvl),
        },
      }),
    });

    if (!response.ok) {
      throw new QuickSwapSubgraphError(
        `Subgraph HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as PoolsQueryResult;
    if (payload.errors?.length) {
      throw new QuickSwapSubgraphError(payload.errors.map((e) => e.message).join("; "));
    }

    const page = payload.data?.pools ?? [];
    pools.push(...page);

    if (page.length < pageSize) {
      break;
    }
    skip += pageSize;
  }

  return pools;
}
