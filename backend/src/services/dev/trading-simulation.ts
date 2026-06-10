import type { Address } from "viem";
import { getQuickSwapEnv } from "../../config/env";
import { getKnownPoolById } from "../defi/quickswap/pool-registry";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { PoolAllocations } from "../agents/strategy.types";
import type {
  WalletBalancesResult,
  WalletTokenBalance,
} from "../wallet/token-balance.service";

function trimFormatted(value: string): string {
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/\.?0+$/, "");
}

function formatBalance(amount: bigint, decimals: number): string {
  const whole = amount / 10n ** BigInt(decimals);
  const frac = amount % 10n ** BigInt(decimals);
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(decimals, "0");
  return trimFormatted(`${whole}.${fracStr}`);
}

/**
 * Resolve strategy pool ids (including legacy slugs) to live QuickSwap pool records.
 */
export async function resolvePoolsForAllocations(
  poolAllocations: PoolAllocations,
): Promise<{ pools: QuickSwapPool[]; activePoolIds: string[] }> {
  const activePoolIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);

  const pools: QuickSwapPool[] = [];
  for (const poolId of activePoolIds) {
    const pool = await getKnownPoolById(poolId);
    if (pool) {
      pools.push(pool);
    }
  }

  return { pools, activePoolIds };
}

/**
 * Build wallet balances that mirror strategy deposit + pool weights (no on-chain funding required).
 */
export function buildSimulatedWalletBalances(input: {
  walletAddress: Address;
  depositAmount: number;
  poolAllocations: PoolAllocations;
  pools: QuickSwapPool[];
}): WalletBalancesResult {
  const { chainId } = getQuickSwapEnv();
  const totalAlloc = Object.values(input.poolAllocations).reduce(
    (sum, value) => sum + value,
    0,
  );

  const scale = BigInt(Math.max(Math.floor(input.depositAmount / 100), 1));
  const tokenTotals = new Map<
    string,
    { symbol: string; name: string; address: Address; decimals: number; amount: bigint }
  >();

  for (const [poolId, alloc] of Object.entries(input.poolAllocations)) {
    if (alloc <= 0 || totalAlloc <= 0) {
      continue;
    }

    const pool =
      input.pools.find((row) => row.id === poolId) ??
      input.pools.find((row) => row.label.toLowerCase().includes(poolId));

    if (!pool) {
      continue;
    }

    const share = alloc / totalAlloc;
    const legScale = BigInt(Math.max(1, Math.round(share * 10)));

    for (const token of [pool.token0, pool.token1]) {
      const key = token.address.toLowerCase();
      const unit = token.decimals === 6 ? 1_000_000n : 10n ** 18n;
      const add = unit * legScale * scale;
      const existing = tokenTotals.get(key);
      if (existing) {
        existing.amount += add;
      } else {
        tokenTotals.set(key, {
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          decimals: token.decimals,
          amount: add,
        });
      }
    }
  }

  const balances: WalletTokenBalance[] = [];
  for (const row of tokenTotals.values()) {
    balances.push({
      symbol: row.symbol,
      name: row.name,
      address: row.address,
      decimals: row.decimals,
      balance: row.amount.toString(),
      formatted: formatBalance(row.amount, row.decimals),
    });
  }

  if (balances.length === 0) {
    balances.push({
      symbol: "USDCe",
      name: "Bridged USDC (simulated)",
      address: "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00",
      decimals: 6,
      balance: (5_000_000n * scale).toString(),
      formatted: formatBalance(5_000_000n * scale, 6),
    });
    balances.push({
      symbol: "WSOMI",
      name: "Wrapped SOMI (simulated)",
      address: "0x046EDe9564A72571df6F5e44d0405360c0f4dCab",
      decimals: 18,
      balance: (10n ** 19n * scale).toString(),
      formatted: formatBalance(10n ** 19n * scale, 18),
    });
  }

  balances.push({
    symbol: "SOMI",
    name: "Somnia (native, simulated gas)",
    address: null,
    decimals: 18,
    balance: (10n ** 17n).toString(),
    formatted: "0.1",
  });

  return {
    chainId,
    walletAddress: input.walletAddress,
    balances,
  };
}
