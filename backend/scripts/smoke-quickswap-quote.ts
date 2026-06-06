/**
 * Smoke-test QuoterV2 + pool price metrics (Phase 1.2).
 * Usage: npm run smoke:quickswap:quote
 */

import { quoteExactIn } from "../src/services/defi/quickswap/quote.service";
import { getEnrichedPool } from "../src/services/defi/quickswap/pool-metrics.service";

const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as const;
const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as const;

async function main() {
  const quote = await quoteExactIn(USDCe, WSOMI, 1_000_000n);
  console.log("USDCe → WSOMI (1 USDCe):");
  console.log(JSON.stringify(quote, null, 2));

  const enriched = await getEnrichedPool("usdce-wsomi");
  if (enriched) {
    console.log("\nEnriched pool usdce-wsomi:");
    console.log(JSON.stringify(enriched, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
