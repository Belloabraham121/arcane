/**
 * Smoke-test QuoterV2 + enriched pool metrics (Phase 8).
 * Usage: npm run smoke:quickswap:quote
 */

import "dotenv/config";
import { quoteExactIn } from "../src/services/defi/quickswap/quote.service";
import { listPoolsForContext } from "../src/services/defi/quickswap/pool-list.service";
import { getEnrichedPool } from "../src/services/defi/quickswap/pool-metrics.service";

const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as const;
const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as const;

async function main() {
  const quote = await quoteExactIn(USDCe, WSOMI, 1_000_000n);
  console.log("USDCe → WSOMI (1 USDCe):");
  console.log(JSON.stringify(quote, null, 2));

  const { pools } = await listPoolsForContext({ context: "all", sort: "tvl" });
  const wsomiPool = pools.find(
    (pool) =>
      pool.token0.symbol === "WSOMI" ||
      pool.token1.symbol === "WSOMI",
  );

  if (!wsomiPool) {
    throw new Error("No WSOMI pool found in catalog");
  }

  const enriched = await getEnrichedPool(wsomiPool.id);
  if (enriched) {
    console.log(`\nEnriched pool ${wsomiPool.label} (${wsomiPool.id}):`);
    console.log(
      JSON.stringify(
        {
          id: enriched.id,
          label: enriched.label,
          metrics: enriched.metrics,
          sampleQuotes: enriched.sampleQuotes,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
