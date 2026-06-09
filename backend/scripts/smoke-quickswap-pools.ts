/**
 * Smoke-test pool list API path (Phase 8).
 * Usage: npm run smoke:quickswap:pools
 */

import "dotenv/config";
import { listPoolsForContext } from "../src/services/defi/quickswap/pool-list.service";

async function main() {
  const contexts = ["all", "auto", "custom"] as const;

  for (const context of contexts) {
    const result = await listPoolsForContext({ context, sort: "liquidity" });
    console.log(`\n=== context=${context} (${result.pools.length} pools) ===`);
    for (const pool of result.pools) {
      console.log(
        [
          pool.label,
          pool.id.slice(0, 10) + "…",
          `TVL=${pool.metrics.totalValueLockedUsd ?? "—"}`,
          `vol=${pool.metrics.volumeUsd ?? "—"}`,
          `liq=${pool.metrics.liquidity}`,
        ].join(" | "),
      );
    }
  }

  const all = await listPoolsForContext({ context: "all" });
  if (all.pools.length === 0) {
    throw new Error("Expected at least one pool on mainnet");
  }

  console.log(`\nOK — ${all.pools.length} viable pool(s) with TVL, liquidity, and volume.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
