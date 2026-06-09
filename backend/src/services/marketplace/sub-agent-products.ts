import type { MarketplaceProductId } from "../../config/marketplace.js";
import type { SubAgentConfigItem } from "../agents/strategy.types.js";

/** Sub-agent → Marketplace product mapping (v1). */
const SUB_AGENT_PRODUCT_MAP: Partial<Record<string, MarketplaceProductId>> = {
  "signal-scout": "signals/spread",
  "bridge-scout": "signals/cross-chain",
  "risk-manager": "pools/snapshot",
  "yield-executor": "pools/snapshot",
};

export function marketplaceProductForSubAgent(
  agentId: string,
): MarketplaceProductId | null {
  return SUB_AGENT_PRODUCT_MAP[agentId] ?? null;
}

export function enabledSubAgentsForMarketplace(
  subAgents: SubAgentConfigItem[],
): SubAgentConfigItem[] {
  return subAgents.filter(
    (agent) =>
      agent.enabled &&
      agent.id !== "root-orchestrator" &&
      marketplaceProductForSubAgent(agent.id) != null,
  );
}
