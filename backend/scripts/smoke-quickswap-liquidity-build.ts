/**
 * Smoke-test NPM liquidity calldata builders (Phase 3.3) — no on-chain submission.
 * Usage: npm run smoke:quickswap:liquidity-build
 * Optional: SMOKE_NPM_TOKEN_ID=123 to test decrease/collect against a live position.
 */

import { getEnrichedPool } from "../src/services/defi/quickswap/pool-metrics.service";
import { quickSwapAdapter } from "../src/services/defi/quickswap/quickswap.adapter";

const RECIPIENT = "0x1111111111111111111111111111111111111111" as const;

async function main() {
  const npm = quickSwapAdapter.getPositionManagerAddress();
  console.log("Position manager:", npm);

  const pool = await getEnrichedPool("usdce-weth");
  if (!pool) {
    throw new Error("Pool usdce-weth not found");
  }

  const tick = pool.metrics.tick;
  const tickRange = {
    tickLower: tick - 600,
    tickUpper: tick + 600,
  };

  const mint = quickSwapAdapter.buildMintPosition(
    pool.token0.address,
    pool.token1.address,
    { amount0: 100_000n, amount1: 100_000_000_000_000n },
    tickRange,
    { recipient: RECIPIENT },
  );

  console.log("\nMint USDCe/WETH position (calldata only):");
  console.log(
    JSON.stringify(
      {
        token0: mint.token0,
        token1: mint.token1,
        tickLower: mint.tickLower,
        tickUpper: mint.tickUpper,
        amount0Desired: mint.amount0Desired.toString(),
        amount1Desired: mint.amount1Desired.toString(),
        approvalCount: mint.approvals.length,
        mintDataPrefix: mint.call.data.slice(0, 18),
      },
      null,
      2,
    ),
  );

  const tokenIdRaw = process.env.SMOKE_NPM_TOKEN_ID;
  if (!tokenIdRaw) {
    console.log(
      "\nSet SMOKE_NPM_TOKEN_ID to smoke decreaseLiquidity + collect builders.",
    );
    return;
  }

  const tokenId = BigInt(tokenIdRaw);
  const position = await quickSwapAdapter.readPositionState(tokenId);
  console.log("\nPosition state:", JSON.stringify(position, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ));

  const remove = await quickSwapAdapter.buildRemoveLiquidity(tokenId, 25);
  console.log("\nRemove 25% liquidity:");
  console.log(
    JSON.stringify(
      {
        liquidity: remove.liquidity.toString(),
        dataPrefix: remove.call.data.slice(0, 18),
      },
      null,
      2,
    ),
  );

  const collect = quickSwapAdapter.buildCollectFees(tokenId, RECIPIENT);
  console.log("\nCollect fees:");
  console.log(
    JSON.stringify(
      {
        recipient: collect.recipient,
        dataPrefix: collect.call.data.slice(0, 18),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
