export type ProtocolId = "uniswap" | "aave" | "compound" | "lido";

export type StrategyType = "auto" | "custom";

export type ProtocolAllocations = Record<ProtocolId, number>;

export type SubAgentConfigItem = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  enabled: boolean;
};

export type AgentStrategy = {
  id: string;
  strategyType: StrategyType;
  status: "draft" | "active";
  depositAmount: number;
  protocolAllocations: ProtocolAllocations;
  subAgents: SubAgentConfigItem[];
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_PROTOCOL_ALLOCATIONS: ProtocolAllocations = {
  uniswap: 50_000_000,
  aave: 30_000_000,
  compound: 25_000_000,
  lido: 35_000_000,
};

export const DEFAULT_DEPOSIT_AMOUNT = 500_000;
