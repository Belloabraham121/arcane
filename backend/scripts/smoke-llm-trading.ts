/**
 * Dev-only: run one live QuickSwap LLM trading cycle (inferToolsChat + on-chain tools).
 * Uses the user's **agent wallet** STT on Somnia testnet (not PRIVATE_KEY).
 *
 * Usage:
 *   npm run smoke:llm:trading -- --email=iteoluwakisibello@gmail.com
 *
 * Fund agent wallet with STT: https://testnet.somnia.network
 */

import "dotenv/config";
import type { Address } from "viem";
import { prisma } from "../src/infrastructure/postgres/client";
import { findUserByEmail } from "../src/services/auth/user.repository";
import { runLlmTradingCycle } from "../src/services/somnia/llm-trading.service";
import { getWalletBalances } from "../src/services/wallet/token-balance.service";
import { resolveSubAgents } from "../src/services/somnia/quickswap-llm-tools";
import { buildLlmTradingCycleInput } from "../tests/helpers/llm-fixtures";
import { mockQuickSwapPool } from "../tests/helpers/fixtures";

const FALLBACK_POOL_ID = "0xd1f1f7b4354bd07e2035d95c12e3192017928054";

function parseArg(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag?.slice(prefix.length + 1);
}

function poolAllocationsFromStrategy(
  rows: { poolId: string; amount: number }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.poolId] = row.amount;
  }
  return map;
}

async function listEligibleUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      walletAddress: true,
      agentStrategy: { select: { status: true, depositAmount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const eligible = users.filter(
    (user) =>
      user.agentStrategy?.status === "active" &&
      (user.agentStrategy.depositAmount ?? 0) > 0,
  );

  if (eligible.length === 0) {
    console.error("No eligible users found.");
    return;
  }

  console.error("\nEligible users (agent wallet must have testnet STT):");
  for (const user of eligible) {
    console.error(`  --email=${user.email}  (wallet ${user.walletAddress})`);
  }
}

async function main() {
  const email = parseArg("--email") ?? process.env.LLM_TEST_EMAIL?.trim();
  if (!email) {
    throw new Error("Pass --email=<signup-email> or set LLM_TEST_EMAIL in .env");
  }

  await prisma.$connect();

  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error(`No user for email: ${email}`);
  }

  const strategy = await prisma.agentStrategy.findUnique({
    where: { userId: user.id },
    include: { poolAllocations: true },
  });

  if (!strategy || strategy.status !== "active" || strategy.depositAmount <= 0) {
    throw new Error("User needs active strategy with depositAmount > 0");
  }

  const poolAllocations = poolAllocationsFromStrategy(strategy.poolAllocations);
  const activePoolIds = Object.entries(poolAllocations)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);
  const primaryPoolId = activePoolIds[0] ?? FALLBACK_POOL_ID;

  console.log("QuickSwap LLM trading smoke");
  console.log("  email:        ", email);
  console.log("  agent wallet: ", user.walletAddress);
  console.log("  pools:        ", activePoolIds.join(", "));
  console.log("  (Agent wallet pays STT on Somnia testnet — fund via faucet if calls fail)\n");

  const balances = await getWalletBalances(
    user.walletAddress as Address,
    activePoolIds,
  );

  const baseInput = buildLlmTradingCycleInput({
    userId: user.id,
    walletAddress: user.walletAddress as Address,
    poolId: primaryPoolId,
    poolAllocations,
    depositAmount: strategy.depositAmount,
    strategyType: strategy.strategyType,
  });

  const result = await runLlmTradingCycle({
    ...baseInput,
    balances,
    pools: [mockQuickSwapPool(primaryPoolId)],
    subAgents: resolveSubAgents(
      strategy.strategyType,
      (strategy.subAgentConfig as never) ?? [],
    ),
    activePoolIds,
  });

  console.log("\nLLM trading result:");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    try {
      await prisma.$connect();
      await listEligibleUsers();
    } catch {
      // ignore
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
