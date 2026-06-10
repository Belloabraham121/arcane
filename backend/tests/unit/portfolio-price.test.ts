import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import {
  isStablecoinSymbol,
  resolveTokenUsdPrices,
  usdPriceFromPool,
} from "../../src/services/portfolio/price.service";
import type { QuickSwapPool } from "../../src/services/defi/quickswap/types";

const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as Address;
const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as Address;

function mockPool(): QuickSwapPool {
  return {
    id: "usdce-wsomi",
    label: "USDCe/WSOMI",
    address: "0xpool" as Address,
    token0: {
      address: USDCe,
      symbol: "USDCe",
      name: "Bridged USDC",
      decimals: 6,
    },
    token1: {
      address: WSOMI,
      symbol: "WSOMI",
      name: "Wrapped SOMI",
      decimals: 18,
    },
    metrics: {
      sqrtPriceX96: "26100788997301769124215",
      tick: -298533,
      liquidity: "157857351899976465",
      reserve0: "1000000",
      reserve1: "1000000000000000000",
      lastFee: 500,
      token1PerToken0: "0.108",
      token0PerToken1: "9.2",
      priceLabel: "1 WSOMI ≈ 0.108 USDCe",
      feeTierPercent: 0.05,
      feeApr: 12.5,
      totalValueLockedUsd: "7500",
      volumeUsd: "1000000",
      lastUpdated: new Date().toISOString(),
    },
  };
}

describe("portfolio price resolver", () => {
  it("treats stablecoins as $1", () => {
    assert.equal(isStablecoinSymbol("USDCe"), true);
    assert.equal(isStablecoinSymbol("USDT"), true);
    assert.equal(isStablecoinSymbol("WSOMI"), false);
  });

  it("derives WSOMI USD from pool stablecoin leg", () => {
    const pool = mockPool();
    assert.equal(usdPriceFromPool("WSOMI", pool), 9.2);
    assert.equal(usdPriceFromPool("USDCe", pool), null);
  });

  it("resolves USDCe and WSOMI via CoinGecko or fallback sources", async () => {
    const prices = await resolveTokenUsdPrices(["USDCe", "WSOMI"], [mockPool()]);
    const usdce = prices.get("USDCe");
    const wsomi = prices.get("WSOMI");

    assert.ok(usdce?.usd != null && usdce.usd > 0.9 && usdce.usd < 1.1);
    assert.ok(usdce?.source === "coingecko" || usdce?.source === "stablecoin");

    assert.ok(wsomi?.usd != null && wsomi.usd > 0);
    assert.ok(
      wsomi?.source === "coingecko" ||
        wsomi?.source === "pool",
    );
  });
});
