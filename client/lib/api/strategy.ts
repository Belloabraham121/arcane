import { apiRequest } from "./client";
import type {
  AgentStrategy,
  ProtocolAllocations,
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
  protocolAllocations?: ProtocolAllocations;
  subAgents?: SubAgentConfigItem[];
}) {
  return apiRequest<{ strategy: AgentStrategy }>("/api/v1/agents/strategy", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function patchProtocolAllocations(protocolAllocations: ProtocolAllocations) {
  return apiRequest<{ strategy: AgentStrategy }>(
    "/api/v1/agents/strategy/protocol-allocations",
    {
      method: "PATCH",
      body: JSON.stringify({ protocolAllocations }),
    },
  );
}

export async function patchSubAgents(subAgents: SubAgentConfigItem[]) {
  return apiRequest<{ strategy: AgentStrategy }>("/api/v1/agents/strategy/sub-agents", {
    method: "PATCH",
    body: JSON.stringify({ subAgents }),
  });
}
