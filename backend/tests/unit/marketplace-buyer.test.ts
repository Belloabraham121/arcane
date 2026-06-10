import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertMarketplaceProductAllowed,
  createMarketplaceBudgetTracker,
  MarketplaceCycleBudgetTracker,
  purchaseMarketplaceProduct,
} from "../../src/services/marketplace/x402-buyer.js";
import {
  decodeNativeSttPaymentSignature,
  encodeNativeSttPaymentSignature,
} from "../../src/services/marketplace/stt-payment.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("MarketplaceCycleBudgetTracker", () => {
  it("enforces per-cycle budget cap", () => {
    const tracker = new MarketplaceCycleBudgetTracker(10_000n);
    tracker.recordSpend(3_000n);
    tracker.recordSpend(7_000n);
    assert.throws(
      () => tracker.assertCanAfford(1n),
      /Would exceed cycle budget/,
    );
  });

  it("tracks remaining budget", () => {
    const tracker = new MarketplaceCycleBudgetTracker(100n);
    tracker.recordSpend(40n);
    assert.equal(tracker.remainingSttWei(), 60n);
  });
});

describe("assertMarketplaceProductAllowed", () => {
  it("rejects unknown product ids", () => {
    assert.throws(
      () => assertMarketplaceProductAllowed("signals/unknown"),
      /not in the Marketplace catalog whitelist/,
    );
  });

  it("accepts catalog products", () => {
    assert.doesNotThrow(() =>
      assertMarketplaceProductAllowed("signals/spread"),
    );
  });
});

describe("stt payment signature roundtrip", () => {
  it("encodes and decodes native STT payment proof", () => {
    const header = encodeNativeSttPaymentSignature({
      txHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      payer: "0x2222222222222222222222222222222222222222",
    });
    const decoded = decodeNativeSttPaymentSignature(header);
    assert.equal(
      decoded?.payload.txHash,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(
      decoded?.payload.payer,
      "0x2222222222222222222222222222222222222222",
    );
  });
});

describe("purchaseMarketplaceProduct", () => {
  it("skips when marketplace is disabled", async () => {
    delete process.env.MARKETPLACE_ENABLED;
    const tracker = createMarketplaceBudgetTracker({
      strategyBudgetSttWei: null,
    });
    const result = await purchaseMarketplaceProduct({
      userId: "user-1",
      productId: "signals/spread",
      accountMode: "live",
      budgetTracker: tracker,
      correlationId: "corr-1",
    });
    assert.equal(result.ok, true);
    if (result.ok && result.skipped) {
      assert.equal(result.reason, "marketplace_disabled");
    }
  });

  it("rejects when product price exceeds cycle budget", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS =
      "0x3333333333333333333333333333333333333333";
    process.env.MARKETPLACE_PRICE_SIGNALS_SPREAD_STT_WEI = "500000000000000000";
    process.env.SUB_AGENT_X402_BUDGET_STT_WEI_DEFAULT = "1000000000000000";

    const tracker = createMarketplaceBudgetTracker({
      strategyBudgetSttWei: null,
    });
    const result = await purchaseMarketplaceProduct({
      userId: "user-1",
      productId: "signals/spread",
      accountMode: "live",
      budgetTracker: tracker,
      correlationId: "corr-2",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /budget/i);
    }
  });
});
