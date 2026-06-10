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

const COINGECKO_CACHE_TTL_MS = 5 * 60_000;
const COINGECKO_STALE_MAX_MS = 30 * 60_000;
const COINGECKO_BACKOFF_MS = 2 * 60_000;

type CacheEntry = {
  usd: number;
  fetchedAt: number;
  expiresAt: number;
};

const coingeckoCache = new Map<string, CacheEntry>();
let coingeckoBackoffUntil = 0;
let inflightCoingeckoFetch: Promise<void> | null = null;

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol);
}

/** USD price from a pool where the other leg is a stablecoin. */
export function usdPriceFromPool(symbol: string, pool: QuickSwapPool): number | null {
  const { token0, token1, metrics } = pool;

  if (symbol === token0.symbol && isStablecoinSymbol(token1.symbol)) {
    const price = metrics.token1PerToken0;
    return isSanePriceString(price) ? Number(price) : null;
  }

  if (symbol === token1.symbol && isStablecoinSymbol(token0.symbol)) {
    const price = metrics.token0PerToken1;
    return isSanePriceString(price) ? Number(price) : null;
  }

  return null;
}

function coingeckoUsdFromCache(coinId: string, allowStale: boolean): number | null {
  const cached = coingeckoCache.get(coinId);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (cached.expiresAt > now) {
    return cached.usd;
  }

  if (allowStale && now - cached.fetchedAt <= COINGECKO_STALE_MAX_MS) {
    return cached.usd;
  }

  return null;
}

function symbolsToCoinIds(symbols: Iterable<string>): string[] {
  const ids = new Set<string>();
  for (const symbol of symbols) {
    const coinId = COINGECKO_IDS[symbol];
    if (coinId) {
      ids.add(coinId);
    }
  }
  return [...ids];
}

async function fetchCoingeckoBatch(coinIds: string[]): Promise<void> {
  if (coinIds.length === 0) {
    return;
  }

  const now = Date.now();
  if (now < coingeckoBackoffUntil) {
    return;
  }

  const missing = coinIds.filter((coinId) => {
    const cached = coingeckoCache.get(coinId);
    return !cached || cached.expiresAt <= now;
  });

  if (missing.length === 0) {
    return;
  }

  if (inflightCoingeckoFetch) {
    await inflightCoingeckoFetch;
    return;
  }

  inflightCoingeckoFetch = (async () => {
    const idsParam = missing.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
    const headers: Record<string, string> = {};
    const apiKey = process.env.COINGECKO_API_KEY?.trim();
    if (apiKey) {
      headers["x-cg-demo-api-key"] = apiKey;
    }

    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        coingeckoBackoffUntil = Date.now() + COINGECKO_BACKOFF_MS;
        log.warn("CoinGecko rate limited (429) — using pool/stable fallbacks and stale cache", {
          coinIds: missing,
          backoffSec: COINGECKO_BACKOFF_MS / 1000,
        });
        return;
      }

      if (!res.ok) {
        log.warn("CoinGecko batch price fetch failed", {
          status: res.status,
          coinIds: missing,
        });
        return;
      }

      const json = (await res.json()) as Record<string, { usd?: number }>;
      const fetchedAt = Date.now();

      for (const coinId of missing) {
        const usd = json[coinId]?.usd;
        if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
          continue;
        }
        coingeckoCache.set(coinId, {
          usd,
          fetchedAt,
          expiresAt: fetchedAt + COINGECKO_CACHE_TTL_MS,
        });
      }
    } catch (err) {
      log.warn("CoinGecko batch price fetch error", {
        coinIds: missing,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inflightCoingeckoFetch = null;
    }
  })();

  await inflightCoingeckoFetch;
}

function coingeckoUsdForSymbol(symbol: string, allowStale: boolean): number | null {
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) {
    return null;
  }
  return coingeckoUsdFromCache(coinId, allowStale);
}

export type TokenUsdPriceSource = "stablecoin" | "pool" | "coingecko" | "unknown";

export type TokenUsdPrice = {
  symbol: string;
  usd: number | null;
  source: TokenUsdPriceSource;
};

/**
 * Resolve USD prices with precedence:
 * 1. CoinGecko for USDCe, WSOMI, SOMI, WETH (single batched request)
 * 2. Stablecoins → $1 peg
 * 3. Pool ratios vs stablecoin leg
 */
export async function resolveTokenUsdPrices(
  symbols: string[],
  pools: QuickSwapPool[],
): Promise<Map<string, TokenUsdPrice>> {
  const unique = [...new Set(symbols)];
  const result = new Map<string, TokenUsdPrice>();

  const coingeckoSymbols = unique.filter((symbol) => COINGECKO_IDS[symbol] != null);
  await fetchCoingeckoBatch(symbolsToCoinIds(coingeckoSymbols));

  for (const symbol of unique) {
    if (COINGECKO_PRIORITY_SYMBOLS.has(symbol)) {
      const cgPrice = coingeckoUsdForSymbol(symbol, true);
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

    const cgPrice = coingeckoUsdForSymbol(symbol, true);
    if (cgPrice != null) {
      result.set(symbol, { symbol, usd: cgPrice, source: "coingecko" });
      continue;
    }

    result.set(symbol, { symbol, usd: null, source: "unknown" });
  }

  return result;
}

/** Test helper — clear in-memory CoinGecko cache and backoff. */
export function clearCoingeckoPriceCache(): void {
  coingeckoCache.clear();
  coingeckoBackoffUntil = 0;
  inflightCoingeckoFetch = null;
}
