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
  createMarketplaceBudgetTracker,
  purchaseMarketplaceProduct,
} from "../../src/services/marketplace/x402-buyer.js";
import {
  createActiveStrategyFixture,
  deleteTestUser,
  mockQuickSwapPool,
  mockWalletBalances,
  type TestUserFixture,
} from "../helpers/fixtures";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("Marketplace purchase integration", () => {
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

  it("buys pools/snapshot in-process with dev bypass", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS =
      "0x5555555555555555555555555555555555555555";
    process.env.MARKETPLACE_X402_DEV_BYPASS = "true";

    await prisma.agentStrategy.update({
      where: { id: fixture.strategyId },
      data: {
        subAgentConfig: [
          {
            id: "risk-manager",
            name: "Risk Manager",
            systemPrompt: "Limit exposure",
            enabled: true,
          },
        ],
      },
    });

    const tracker = createMarketplaceBudgetTracker({
      strategyBudgetSttWei: null,
    });

    const result = await purchaseMarketplaceProduct({
      userId: fixture.userId,
      productId: "pools/snapshot",
      accountMode: "live",
      budgetTracker: tracker,
      correlationId: "smoke-cycle-test",
      buyer: {
        cycleId: "00000000-0000-4000-8000-000000000001",
        subAgentId: "risk-manager",
        subAgentName: "Risk Manager",
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) {
      assert.fail("expected purchase success");
    }
    assert.equal(result.productId, "pools/snapshot");
    assert.equal(result.devBypass, true);
    assert.ok(result.data);

    const receipts = await prisma.marketplacePurchase.findMany({
      where: { userId: fixture.userId, productId: "pools/snapshot" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.subAgentId, "risk-manager");
    assert.equal(receipts[0]?.status, "success");
  });

  it("persists marketplace_purchase trading actions on cycle completion", async () => {
    const mockPool = mockQuickSwapPool(fixture.poolId);

    const mockLlm: DualLlmTradingCycleResult = {
      llmResponse: "Mock: hold after marketplace data purchase.",
      toolActions: [],
      executedTransactions: [],
      usedLlm: true,
      provider: "openai",
      message: "Mock cycle with marketplace purchase",
      somniaAttestation: {
        status: "skipped",
        requestId: null,
        txHash: null,
        onChainResponse: null,
        message: "Skipped in test",
      },
      subAgentOutputs: [
        {
          agentId: "risk-manager",
          agentName: "Risk Manager",
          summary: "Pool snapshot reviewed.",
          data: { ok: true },
          durationMs: 120,
          marketplaceProductId: "pools/snapshot",
          marketplacePurchase: {
            amountSttWei: "5000000000000000",
            txHash: null,
            devBypass: true,
            status: "success",
            productData: { pools: [] },
          },
        },
      ],
      marketplacePreflight: {
        ok: true,
        skipped: false,
      },
    };

    const summary = await runTradingCycle(fixture.userId, "manual", {
      listPoolsWithMetrics: async () => [mockPool],
      getWalletBalances: async () => mockWalletBalances(fixture.walletAddress),
      runDualLlmTradingCycle: async () => mockLlm,
    });

    const detail = await getTradingCycleDetail(fixture.userId, summary.cycleId);
    assert.ok(detail);
    const marketplaceAction = detail!.actions.find(
      (action) => action.type === "marketplace_purchase",
    );
    assert.ok(marketplaceAction, "expected marketplace_purchase action");
    assert.equal(marketplaceAction!.toolName, "pools/snapshot");
    assert.equal(marketplaceAction!.status, "success");
    const meta = marketplaceAction!.metadata as {
      productId?: string;
      amountSttWei?: string;
    };
    assert.equal(meta.productId, "pools/snapshot");
    assert.equal(meta.amountSttWei, "5000000000000000");
  });
});
