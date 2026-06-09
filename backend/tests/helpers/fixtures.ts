import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Address } from "viem";
import { prisma } from "../../src/infrastructure/postgres/client";
import { emailWalletService } from "../../src/services/auth/email-wallet.service";
import { createUser } from "../../src/services/auth/user.repository";
import { upsertStrategy } from "../../src/services/agents/strategy.repository";
import type { QuickSwapPool } from "../../src/services/defi/quickswap/types";
import type { WalletBalancesResult } from "../../src/services/wallet/token-balance.service";

const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as Address;
const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as Address;

export type TestUserFixture = {
  userId: string;
  email: string;
  walletAddress: Address;
  strategyId: string;
  poolId: string;
};

export function mockQuickSwapPool(poolId: string): QuickSwapPool {
  return {
    id: poolId,
    label: "USDCe/WSOMI",
    address: poolId as Address,
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

export function mockWalletBalances(walletAddress: Address): WalletBalancesResult {
  return {
    chainId: 5031,
    walletAddress,
    balances: [
      {
        symbol: "USDCe",
        name: "Bridged USDC",
        address: USDCe,
        decimals: 6,
        balance: "5000000",
        formatted: "5",
      },
      {
        symbol: "WSOMI",
        name: "Wrapped SOMI",
        address: WSOMI,
        decimals: 18,
        balance: "10000000000000000000",
        formatted: "10",
      },
    ],
  };
}

export async function createActiveStrategyFixture(): Promise<TestUserFixture> {
  const email = `phase8-test-${randomUUID()}@arcane.test`;
  const wallet = emailWalletService.createWalletRecord(email);
  const user = await createUser({
    email,
    passwordHash: await bcrypt.hash("test-password-phase8", 10),
    wallet,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { accountMode: "live" },
  });

  const poolId = "0xd1f1f7b4354bd07e2035d95c12e3192017928054";
  const strategy = await upsertStrategy(user.id, {
    strategyType: "custom",
    status: "active",
    depositAmount: 1000,
    poolAllocations: { [poolId]: 105_000_000 },
    subAgentConfig: [],
  });

  return {
    userId: user.id,
    email,
    walletAddress: wallet.address as Address,
    strategyId: strategy.id,
    poolId,
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
