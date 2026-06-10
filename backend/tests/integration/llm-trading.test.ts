import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Address } from "viem";
import { getSomniaAgentEnv } from "../../src/config/env";
import { prisma } from "../../src/infrastructure/postgres/client";
import { findUserByEmail } from "../../src/services/auth/user.repository";
import { runLlmTradingCycle } from "../../src/services/somnia/llm-trading.service";
import { getWalletBalances } from "../../src/services/wallet/token-balance.service";
import { resolveSubAgents } from "../../src/services/somnia/quickswap-llm-tools";
import { buildLlmTradingCycleInput } from "../helpers/llm-fixtures";
import { mockQuickSwapPool } from "../helpers/fixtures";

const runLlmTests = process.env.RUN_LLM_TESTS === "1";
const llmTestEmail = process.env.LLM_TEST_EMAIL?.trim();
const describeLlm = runLlmTests && llmTestEmail ? describe : describe.skip;

const agentEnv = getSomniaAgentEnv();
const LLM_TIMEOUT_MS = agentEnv.requestTimeoutMs + 180_000;
const FALLBACK_POOL_ID = "0xd1f1f7b4354bd07e2035d95c12e3192017928054";

function poolAllocationsFromStrategy(
  rows: { poolId: string; amount: number }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.poolId] = row.amount;
  }
  return map;
}

describeLlm("runLlmTradingCycle (live Somnia + QuickSwap tools)", () => {
  let userId: string;
  let walletAddress: Address;

  before(async () => {
    await prisma.$connect();

    const user = await findUserByEmail(llmTestEmail!);
    assert.ok(user, `No user for LLM_TEST_EMAIL=${llmTestEmail}`);

    userId = user.id;
    walletAddress = user.walletAddress as Address;

    const strategy = await prisma.agentStrategy.findUnique({
      where: { userId },
      include: { poolAllocations: true },
    });

    assert.ok(strategy, "User needs an agent strategy");
    assert.equal(strategy.status, "active", "Strategy must be active");
    assert.ok(strategy.depositAmount > 0, "depositAmount must be > 0");
    assert.ok(
      strategy.poolAllocations.some((row) => row.amount > 0),
      "At least one pool allocation required",
    );
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it(
    "completes inferToolsChat with portfolio context and records tool or text output",
    { timeout: LLM_TIMEOUT_MS },
    async () => {
      const strategy = await prisma.agentStrategy.findUniqueOrThrow({
        where: { userId },
        include: { poolAllocations: true },
      });

      const poolAllocations = poolAllocationsFromStrategy(strategy.poolAllocations);
      const activePoolIds = Object.entries(poolAllocations)
        .filter(([, amount]) => amount > 0)
        .map(([id]) => id);

      const primaryPoolId = activePoolIds[0] ?? FALLBACK_POOL_ID;
      const balances = await getWalletBalances(walletAddress, activePoolIds);

      const baseInput = buildLlmTradingCycleInput({
        userId,
        walletAddress,
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

      assert.equal(result.usedLlm, true);
      assert.ok(
        (result.llmResponse && result.llmResponse.length > 0) ||
          result.toolActions.length > 0,
        "Expected LLM text response and/or tool actions",
      );
      assert.ok(result.message.length > 0);
    },
  );
});
