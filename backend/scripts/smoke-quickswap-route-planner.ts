/**
 * Smoke-test route planner (Phase 3.2) — quotes only, no on-chain submission.
 * Usage: npm run smoke:quickswap:route-planner
 */

import { quickSwapAdapter } from "../src/services/defi/quickswap/quickswap.adapter";
import {
  buildTokenGraph,
  findTokenPaths,
} from "../src/services/defi/quickswap/route-planner";
import { listKnownPools } from "../src/services/defi/quickswap/pool-registry";

const RECIPIENT = "0x1111111111111111111111111111111111111111" as const;

async function main() {
  const pools = await listKnownPools();
  console.log(
    "Known pools:",
    pools.map((p) => `${p.id} (${p.token0.symbol}/${p.token1.symbol})`).join(", "),
  );

  const graph = buildTokenGraph(pools);
  const wsomiPool = pools.find((p) => p.id === "usdce-wsomi")!;
  const wethPool = pools.find((p) => p.id === "usdce-weth")!;
  const wsomi =
    wsomiPool.token0.symbol === "WSOMI"
      ? wsomiPool.token0.address
      : wsomiPool.token1.address;
  const weth =
    wethPool.token0.symbol === "WETH"
      ? wethPool.token0.address
      : wethPool.token1.address;

  const paths = findTokenPaths(graph, wsomi, weth);
  console.log(`\nWSOMI → WETH candidate paths (${paths.length}):`);
  for (const path of paths) {
    const symbols = path.map((addr) => {
      for (const pool of pools) {
        if (pool.token0.address === addr) return pool.token0.symbol;
        if (pool.token1.address === addr) return pool.token1.symbol;
      }
      return addr.slice(0, 8);
    });
    console.log(" ", symbols.join(" → "));
  }

  const best = await quickSwapAdapter.findBestRoute(wsomi, weth, 10n ** 18n);
  console.log("\nBest WSOMI → WETH route (1 WSOMI):");
  console.log(
    JSON.stringify(
      {
        hops: best.hops,
        poolIds: best.poolIds,
        amountOut: best.quote.amountOut,
        gasEstimate: best.quote.gasEstimate,
      },
      null,
      2,
    ),
  );

  const rebalance = await quickSwapAdapter.planRebalance(
    "usdce-wsomi",
    "usdce-weth",
    10n ** 18n,
    RECIPIENT,
  );

  console.log("\nplanRebalance(usdce-wsomi → usdce-weth, 1 WSOMI):");
  if (rebalance.kind === "no_swap") {
    console.log(JSON.stringify(rebalance, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          kind: rebalance.kind,
          tokenIn: rebalance.tokenIn,
          tokenOut: rebalance.tokenOut,
          hops: rebalance.hops,
          poolIds: rebalance.poolIds,
          amountOut: rebalance.quote.amountOut,
          amountOutMinimum: rebalance.swap.amountOutMinimum.toString(),
        },
        null,
        2,
      ),
    );
  }

  const usdce =
    wsomiPool.token0.symbol === "USDCe"
      ? wsomiPool.token0.address
      : wsomiPool.token1.address;
  const shared = await quickSwapAdapter.planRebalance(
    "usdce-wsomi",
    "usdce-weth",
    1_000_000n,
    RECIPIENT,
    { tokenIn: usdce, tokenOut: usdce },
  );
  console.log("\nShared-token rebalance (USDCe → USDCe, no swap):");
  console.log(
    JSON.stringify(shared, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
