/**
 * Smoke-test pool discovery (Phase 1.1).
 * Usage: npx tsx scripts/smoke-quickswap-pools.ts
 */

import { listKnownPools } from "../src/services/defi/quickswap/pool-registry";

async function main() {
  const pools = await listKnownPools();
  console.log(`Found ${pools.length} pool(s)`);
  for (const pool of pools) {
    console.log(JSON.stringify(pool, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
