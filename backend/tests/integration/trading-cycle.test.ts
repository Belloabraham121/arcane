import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client";
import {
  resetTradingRunnerStateForTests,
  runTradingCycle,
} from "../../src/services/agents/trading-runner.service";
import { getTradingCycleDetail } from "../../src/services/agents/trading.repository";
import type { DualLlmTradingCycleResult } from "../../src/services/agents/dual-llm-trading.service";
import {
  createActiveStrategyFixture,
  deleteTestUser,
  mockQuickSwapPool,
  mockWalletBalances,
  type TestUserFixture,
} from "../helpers/fixtures";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("runTradingCycle with mocked LLM", () => {
  let fixture: TestUserFixture;

  before(async () => {
    await prisma.$connect();
    fixture = await createActiveStrategyFixture();
    resetTradingRunnerStateForTests();
  });

  after(async () => {
    if (fixture?.userId) {
      await deleteTestUser(fixture.userId);
    }
    resetTradingRunnerStateForTests();
    await prisma.$disconnect();
  });

  it("records a trading cycle and quote action", async () => {
    const mockPool = mockQuickSwapPool(fixture.poolId);

    const mockLlm: DualLlmTradingCycleResult = {
      llmResponse: "Mock: hold positions; quoted WSOMI/USDCe spread.",
      toolActions: [
        {
          tool: "quoteSwap",
          success: true,
          result: JSON.stringify({
            tokenIn: mockPool.token0.address,
            tokenOut: mockPool.token1.address,
            amountOut: "108000000000000000",
          }),
        },
      ],
      executedTransactions: [],
      usedLlm: true,
      provider: "openai",
      message: "Mock LLM cycle completed",
      somniaAttestation: {
        status: "submitted",
        requestId: "12345",
        txHash: "0xabc1234567890123456789012345678901234567890123456789012345678901234",
        onChainResponse: null,
        message: "Mock Somnia attestation",
      },
      subAgentOutputs: [],
      marketplacePreflight: {
        ok: true,
        skipped: true,
        skippedReason: "marketplace_disabled",
      },
    };

    const summary = await runTradingCycle(fixture.userId, "manual", {
      listPoolsWithMetrics: async () => [mockPool],
      getWalletBalances: async () => mockWalletBalances(fixture.walletAddress),
      runDualLlmTradingCycle: async () => mockLlm,
    });

    assert.equal(summary.phase, "completed");
    assert.equal(summary.userId, fixture.userId);
    assert.ok(summary.cycleId.length > 0);

    const detail = await getTradingCycleDetail(fixture.userId, summary.cycleId);
    assert.ok(detail, "cycle should be persisted");
    assert.equal(detail!.status, "completed");
    assert.ok(detail!.actions.length >= 1, "expected at least one recorded action");
    assert.ok(
      detail!.actions.some((action) => action.type === "quote"),
      "expected a quote action from mocked LLM tool",
    );
  });
});
