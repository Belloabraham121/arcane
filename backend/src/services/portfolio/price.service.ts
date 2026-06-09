import { createLogger } from "../../shared/logger";
import { isSanePriceString } from "../defi/quickswap/pool-metrics.service";
import type { QuickSwapPool } from "../defi/quickswap/types";

const log = createLogger("portfolio-price");

const STABLECOIN_SYMBOLS = new Set(["USDCe", "USDC", "USDT"]);

const COINGECKO_IDS: Record<string, string> = {
  USDCe: "usd-coin",
  USDC: "usd-coin",
  SOMI: "somnia-network",
  WSOMI: "somnia-network",
  WETH: "ethereum",
};

/** Prefer live market prices from CoinGecko for these symbols (then pool / peg fallback). */
const COINGECKO_PRIORITY_SYMBOLS = new Set([
  "USDCe",
  "USDC",
  "WSOMI",
  "SOMI",
  "WETH",
]);

const COINGECKO_CACHE_TTL_MS = 60_000;

type CacheEntry = {
  usd: number;
  expiresAt: number;
};

const coingeckoCache = new Map<string, CacheEntry>();

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol);
}

/** USD price from a pool where the other leg is a stablecoin. */
export function usdPriceFromPool(symbol: string, pool: QuickSwapPool): number | null {
  const { token0, token1, metrics } = pool;

  // token1 is stable → token0 priced in USD via token1PerToken0 (stable per token0).
  if (symbol === token0.symbol && isStablecoinSymbol(token1.symbol)) {
    const price = metrics.token1PerToken0;
    return isSanePriceString(price) ? Number(price) : null;
  }

  // token0 is stable → token1 priced in USD via token0PerToken1 (stable per token1).
  if (symbol === token1.symbol && isStablecoinSymbol(token0.symbol)) {
    const price = metrics.token0PerToken1;
    return isSanePriceString(price) ? Number(price) : null;
  }

  return null;
}

async function fetchCoingeckoUsd(symbol: string): Promise<number | null> {
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) {
    return null;
  }

  const cached = coingeckoCache.get(coinId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.usd;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    const res = await fetch(url);
    if (!res.ok) {
      log.warn("CoinGecko price fetch failed", { symbol, status: res.status });
      return null;
    }

    const json = (await res.json()) as Record<string, { usd?: number }>;
    const usd = json[coinId]?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
      return null;
    }

    coingeckoCache.set(coinId, {
      usd,
      expiresAt: Date.now() + COINGECKO_CACHE_TTL_MS,
    });
    return usd;
  } catch (err) {
    log.warn("CoinGecko price fetch error", {
      symbol,
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type TokenUsdPriceSource = "stablecoin" | "pool" | "coingecko" | "unknown";

export type TokenUsdPrice = {
  symbol: string;
  usd: number | null;
  source: TokenUsdPriceSource;
};

/**
 * Resolve USD prices with precedence:
 * 1. CoinGecko for USDCe, WSOMI, SOMI, WETH (live market)
 * 2. Stablecoins → $1 peg
 * 3. Pool ratios vs stablecoin leg
 */
export async function resolveTokenUsdPrices(
  symbols: string[],
  pools: QuickSwapPool[],
): Promise<Map<string, TokenUsdPrice>> {
  const unique = [...new Set(symbols)];
  const result = new Map<string, TokenUsdPrice>();

  for (const symbol of unique) {
    if (COINGECKO_PRIORITY_SYMBOLS.has(symbol)) {
      const cgPrice = await fetchCoingeckoUsd(symbol);
      if (cgPrice != null) {
        result.set(symbol, { symbol, usd: cgPrice, source: "coingecko" });
        continue;
      }
    }

    if (isStablecoinSymbol(symbol)) {
      result.set(symbol, { symbol, usd: 1, source: "stablecoin" });
      continue;
    }

    let poolPrice: number | null = null;
    for (const pool of pools) {
      poolPrice = usdPriceFromPool(symbol, pool);
      if (poolPrice != null) {
        break;
      }
    }

    if (poolPrice != null) {
      result.set(symbol, { symbol, usd: poolPrice, source: "pool" });
      continue;
    }

    const cgPrice = await fetchCoingeckoUsd(symbol);
    if (cgPrice != null) {
      result.set(symbol, { symbol, usd: cgPrice, source: "coingecko" });
      continue;
    }

    result.set(symbol, { symbol, usd: null, source: "unknown" });
  }

  return result;
}

/** Test helper — clear in-memory CoinGecko cache. */
export function clearCoingeckoPriceCache(): void {
  coingeckoCache.clear();
}
