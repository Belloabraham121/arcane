import type { Address } from "viem";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import {
  getWalletBalances,
  type WalletTokenBalance,
} from "../wallet/token-balance.service";
import { resolveTokenUsdPrices } from "./price.service";
import type { PortfolioRpcMode } from "./wallet-context.service";
import { withPortfolioRpc } from "./wallet-context.service";

export type PortfolioPosition = {
  symbol: string;
  amount: number;
  valueUsd: number | null;
  priceUsd: number | null;
  priceSource: string;
};

export type WalletValuation = {
  totalValueUsd: number;
  pricedValueUsd: number;
  unpricedSymbols: string[];
  positions: PortfolioPosition[];
};

function parseFormattedAmount(formatted: string): number {
  const n = Number(formatted);
  return Number.isFinite(n) ? n : 0;
}

function positionFromBalance(
  balance: WalletTokenBalance,
  priceUsd: number | null,
  priceSource: string,
): PortfolioPosition {
  const amount = parseFormattedAmount(balance.formatted);
  const valueUsd = priceUsd != null ? amount * priceUsd : null;

  return {
    symbol: balance.symbol,
    amount,
    valueUsd,
    priceUsd,
    priceSource,
  };
}

export async function valueWallet(
  walletAddress: Address,
  poolIds: string[],
  rpcMode: PortfolioRpcMode,
): Promise<WalletValuation> {
  return withPortfolioRpc(rpcMode, async () => {
    const [balances, pools] = await Promise.all([
      getWalletBalances(walletAddress, poolIds),
      listPoolsWithMetrics(),
    ]);

    const activePools = poolIds.length
      ? pools.filter((pool) => poolIds.includes(pool.id))
      : pools;

    const symbols = balances.balances.map((b) => b.symbol);
    const prices = await resolveTokenUsdPrices(symbols, activePools);

    const positions = balances.balances.map((balance) => {
      const price = prices.get(balance.symbol);
      return positionFromBalance(
        balance,
        price?.usd ?? null,
        price?.source ?? "unknown",
      );
    });

    const pricedValueUsd = positions.reduce(
      (sum, pos) => sum + (pos.valueUsd ?? 0),
      0,
    );
    const unpricedSymbols = positions
      .filter((pos) => pos.valueUsd == null && pos.amount > 0)
      .map((pos) => pos.symbol);

    return {
      totalValueUsd: pricedValueUsd,
      pricedValueUsd,
      unpricedSymbols,
      positions,
    };
  });
}
