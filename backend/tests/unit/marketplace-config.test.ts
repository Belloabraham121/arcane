import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildMarketplaceSummary,
  getMarketplaceEnv,
  parseSubAgentX402BudgetSttWei,
} from "../../src/config/marketplace.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getMarketplaceEnv", () => {
  it("defaults to STT payment asset and disabled marketplace", () => {
    delete process.env.MARKETPLACE_ENABLED;
    delete process.env.MARKETPLACE_PAYMENT_ASSET;

    const env = getMarketplaceEnv();
    assert.equal(env.paymentAsset, "STT");
    assert.equal(env.enabled, false);
    assert.equal(env.productPricesSttWei["pools/snapshot"], 5_000_000_000_000_000n);
  });

  it("rejects USDC as payment asset", () => {
    process.env.MARKETPLACE_PAYMENT_ASSET = "USDC";
    assert.throws(() => getMarketplaceEnv(), /USDC and USDT settlement paths are not supported/);
  });

  it("rejects explicit USDT payment flag", () => {
    process.env.MARKETPLACE_PAYMENT_USDT = "true";
    assert.throws(() => getMarketplaceEnv(), /USDC\/USDT payment paths/);
  });

  it("requires seller address when enabled", () => {
    process.env.MARKETPLACE_ENABLED = "true";
    delete process.env.MARKETPLACE_SELLER_ADDRESS;
    assert.throws(() => getMarketplaceEnv(), /MARKETPLACE_SELLER_ADDRESS is required/);
  });
});

describe("buildMarketplaceSummary", () => {
  it("exposes budget, zero spend, and product prices", () => {
    delete process.env.MARKETPLACE_ENABLED;
    const summary = buildMarketplaceSummary({ strategyBudgetSttWei: null });
    assert.equal(summary.paymentAsset, "STT");
    assert.equal(summary.spendSttWei, "0");
    assert.equal(summary.budgetSttWei, "100000000000000000");
    assert.equal(summary.remainingSttWei, summary.budgetSttWei);
    assert.equal(summary.productPricesSttWei["signals/spread"], "3000000000000000");
  });
});

describe("parseSubAgentX402BudgetSttWei", () => {
  it("parses wei strings", () => {
    assert.equal(parseSubAgentX402BudgetSttWei("5000"), 5000n);
  });

  it("rejects negative values", () => {
    assert.throws(
      () => parseSubAgentX402BudgetSttWei(-1),
      /non-negative/,
    );
  });
});
