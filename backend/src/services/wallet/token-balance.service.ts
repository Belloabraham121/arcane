import type { Address } from "viem";
import { formatUnits } from "viem";
import { getQuickSwapBundle, type QuickSwapToken } from "../../config/quickswap";
import { getQuickSwapEnv } from "../../config/env";
import { erc20MinimalAbi } from "../defi/quickswap/abis";
import { getQuickSwapPublicClient } from "../defi/quickswap/client";
import { listKnownPools } from "../defi/quickswap/pool-registry";
import type { QuickSwapPoolToken } from "../defi/quickswap/types";

export type WalletTokenBalance = {
  symbol: string;
  name: string;
  /** Null for native SOMI. */
  address: Address | null;
  decimals: number;
  balance: string;
  formatted: string;
};

export type WalletBalancesResult = {
  chainId: number;
  walletAddress: Address;
  balances: WalletTokenBalance[];
};

function trimFormatted(value: string): string {
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/\.?0+$/, "");
}

function toBalanceRow(
  token: Pick<QuickSwapToken, "symbol" | "name" | "address" | "decimals">,
  amount: bigint,
): WalletTokenBalance {
  const formatted = trimFormatted(formatUnits(amount, token.decimals));
  return {
    symbol: token.symbol,
    name: token.name,
    address: token.address,
    decimals: token.decimals,
    balance: amount.toString(),
    formatted,
  };
}

function uniqueTokens(tokens: QuickSwapPoolToken[]): QuickSwapPoolToken[] {
  const seen = new Set<string>();
  const result: QuickSwapPoolToken[] = [];
  for (const token of tokens) {
    const key = token.address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(token);
  }
  return result;
}

/** Tokens that appear in the given pool ids (or all seed pools when omitted). */
export async function resolveTokensForPools(poolIds?: string[]): Promise<QuickSwapPoolToken[]> {
  const pools = await listKnownPools();
  const idSet = poolIds?.length ? new Set(poolIds) : null;

  const tokens: QuickSwapPoolToken[] = [];
  for (const pool of pools) {
    if (idSet && !idSet.has(pool.id)) {
      continue;
    }
    tokens.push(pool.token0, pool.token1);
  }

  return uniqueTokens(tokens);
}

export async function getWalletBalances(
  walletAddress: Address,
  poolIds?: string[],
): Promise<WalletBalancesResult> {
  const { chainId } = getQuickSwapEnv();
  const client = getQuickSwapPublicClient();
  const tokens = await resolveTokensForPools(poolIds);

  const balances: WalletTokenBalance[] = [];

  const nativeBalance = await client.getBalance({ address: walletAddress });
  const bundle = getQuickSwapBundle(chainId);
  const hasWsomi = tokens.some((t) => t.symbol === "WSOMI");
  if (hasWsomi) {
    const formatted = trimFormatted(formatUnits(nativeBalance, 18));
    balances.push({
      symbol: "SOMI",
      name: "Somnia (native)",
      address: null,
      decimals: 18,
      balance: nativeBalance.toString(),
      formatted,
    });
  }

  const erc20Reads = await Promise.all(
    tokens.map(async (token) => {
      const amount = await client.readContract({
        address: token.address,
        abi: erc20MinimalAbi,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      return toBalanceRow(token, amount);
    }),
  );

  balances.push(...erc20Reads);

  return {
    chainId,
    walletAddress,
    balances,
  };
}
