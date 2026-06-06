/**
 * Smoke-test swap calldata builders (Phase 3.1) — no on-chain submission.
 * Usage: npm run smoke:quickswap:swap-build
 */

import { encodeAlgebraSwapPath } from "../src/services/defi/quickswap/path-encoding";
import { quickSwapAdapter } from "../src/services/defi/quickswap/quickswap.adapter";

const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as const;
const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as const;
const WETH = "0x936Ab8C674bcb567CD5dEB85D8A216494704E9D8" as const;
const RECIPIENT = "0x1111111111111111111111111111111111111111" as const;

async function main() {
  const router = quickSwapAdapter.getRouterAddress();
  console.log("Swap router:", router);

  const single = await quickSwapAdapter.buildSwapExactInWithQuote(
    USDCe,
    WSOMI,
    1_000_000n,
    RECIPIENT,
  );
  console.log("\nSingle-hop USDCe → WSOMI (1 USDCe):");
  console.log(
    JSON.stringify(
      {
        quote: single.quote,
        amountOutMinimum: single.swap.amountOutMinimum.toString(),
        deadline: single.swap.deadline.toString(),
        swapTo: single.swap.call.to,
        swapDataPrefix: single.swap.call.data.slice(0, 18),
        approveTo: single.approve?.to,
      },
      null,
      2,
    ),
  );

  const path = [USDCe, WSOMI, WETH] as const;
  const encodedPath = encodeAlgebraSwapPath(path);
  console.log("\nEncoded multihop path (USDCe → WSOMI → WETH):");
  console.log(encodedPath);

  try {
    const multi = await quickSwapAdapter.buildSwapRouteWithQuote(
      path,
      1_000_000n,
      RECIPIENT,
    );
    console.log("\nMultihop USDCe → WSOMI → WETH (1 USDCe):");
    console.log(
      JSON.stringify(
        {
          quote: multi.quote,
          amountOutMinimum: multi.swap.amountOutMinimum.toString(),
          pathMatches: multi.swap.path === encodedPath,
          swapDataPrefix: multi.swap.call.data.slice(0, 18),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    const routeOnly = quickSwapAdapter.buildSwapRoute(
      path,
      1_000_000n,
      quickSwapAdapter.getDefaultSlippageBps(),
      RECIPIENT,
      { quotedAmountOut: BigInt(single.quote.amountOut) },
    );
    console.log("\nMultihop quote unavailable — calldata build still OK:");
    console.log(
      JSON.stringify(
        {
          pathMatches: routeOnly.path === encodedPath,
          amountOutMinimum: routeOnly.amountOutMinimum.toString(),
          swapDataPrefix: routeOnly.call.data.slice(0, 18),
          note: err instanceof Error ? err.message : String(err),
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
