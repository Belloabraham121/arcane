import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SubAgentConfigItem } from "../../src/services/agents/strategy.types.js";
import {
  enabledSubAgentsForMarketplace,
  marketplaceProductForSubAgent,
  subAgentUsesMarketplaceData,
} from "../../src/services/marketplace/sub-agent-products.js";

const riskManager: SubAgentConfigItem = {
  id: "risk-manager",
  name: "Risk Manager",
  systemPrompt: "Limit risk",
  enabled: true,
};

describe("marketplace sub-agent products", () => {
  it("maps risk-manager to pools/snapshot", () => {
    assert.equal(marketplaceProductForSubAgent("risk-manager"), "pools/snapshot");
  });

  it("respects useMarketplaceData=false", () => {
    assert.equal(
      subAgentUsesMarketplaceData({ ...riskManager, useMarketplaceData: false }),
      false,
    );
    assert.equal(subAgentUsesMarketplaceData(riskManager), true);
  });

  it("excludes sub-agents that opted out of marketplace data", () => {
    const agents: SubAgentConfigItem[] = [
      riskManager,
      {
        id: "signal-scout",
        name: "Signal Scout",
        systemPrompt: "Scan",
        enabled: true,
        useMarketplaceData: false,
      },
    ];
    const buyers = enabledSubAgentsForMarketplace(agents);
    assert.equal(buyers.length, 1);
    assert.equal(buyers[0]?.id, "risk-manager");
  });
});
