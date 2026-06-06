import { apiRequest } from "./client";
import type {
  AgentStrategy,
  PoolAllocations,
  StrategyType,
  SubAgentConfigItem,
} from "./strategy-types";

export async function getAgentStrategy() {
  return apiRequest<{ strategy: AgentStrategy }>("/api/v1/agents/strategy");
}

export async function upsertAgentStrategy(input: {
  strategyType: StrategyType;
  status?: AgentStrategy["status"];
  depositAmount?: number;
  poolAllocations?: PoolAllocations;
  subAgents?: SubAgentConfigItem[];
}) {
  return apiRequest<{ strategy: AgentStrategy }>("/api/v1/agents/strategy", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function patchPoolAllocations(poolAllocations: PoolAllocations) {
  return apiRequest<{ strategy: AgentStrategy }>(
    "/api/v1/agents/strategy/pool-allocations",
    {
      method: "PATCH",
      body: JSON.stringify({ poolAllocations }),
    },
  );
}

export async function patchSubAgents(subAgents: SubAgentConfigItem[]) {
  return apiRequest<{ strategy: AgentStrategy }>("/api/v1/agents/strategy/sub-agents", {
    method: "PATCH",
    body: JSON.stringify({ subAgents }),
  });
}
