import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  estimateMarketplaceCycleSpendSttWei,
  formatInsufficientSttMessage,
} from "../../src/services/marketplace/preflight.js";
import type { SubAgentConfigItem } from "../../src/services/agents/strategy.types.js";

const originalEnv = { ...process.env };

const signalScout: SubAgentConfigItem = {
  id: "signal-scout",
  name: "Signal Scout",
  systemPrompt: "Scan",
  enabled: true,
};

const bridgeScout: SubAgentConfigItem = {
  id: "bridge-scout",
  name: "Bridge Scout",
  systemPrompt: "Bridge",
  enabled: true,
};

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("estimateMarketplaceCycleSpendSttWei", () => {
  it("sums unique product prices for enabled sub-agents", () => {
    delete process.env.MARKETPLACE_ENABLED;
    const spend = estimateMarketplaceCycleSpendSttWei(
      [signalScout, bridgeScout],
      1_000_000_000_000_000_000n,
    );
    // spread 0.003 STT + cross-chain 0.005 STT
    assert.equal(spend, 8_000_000_000_000_000n);
  });

  it("caps spend at per-cycle budget", () => {
    delete process.env.MARKETPLACE_ENABLED;
    const spend = estimateMarketplaceCycleSpendSttWei(
      [signalScout, bridgeScout],
      5_000_000_000_000_000n,
    );
    assert.equal(spend, 5_000_000_000_000_000n);
  });

  it("returns zero when no marketplace-mapped sub-agents are enabled", () => {
    const spend = estimateMarketplaceCycleSpendSttWei(
      [
        {
          id: "custom-agent",
          name: "Custom",
          systemPrompt: "x",
          enabled: true,
        },
      ],
      1_000_000_000_000_000_000n,
    );
    assert.equal(spend, 0n);
  });
});

describe("formatInsufficientSttMessage", () => {
  it("includes faucet URL", () => {
    const message = formatInsufficientSttMessage({
      walletAddress: "0xabc0000000000000000000000000000000000001",
      balanceSttWei: 1000n,
      requiredSttWei: 5000n,
    });
    assert.match(message, /insufficient STT/i);
    assert.match(message, /https:\/\/testnet\.somnia\.network/);
  });
});
