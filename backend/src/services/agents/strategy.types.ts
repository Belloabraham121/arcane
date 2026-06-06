export const PROTOCOL_IDS = ["uniswap", "aave", "compound", "lido"] as const;
export type ProtocolId = (typeof PROTOCOL_IDS)[number];

export type StrategyType = "auto" | "custom";
export type StrategyStatus = "draft" | "active";

export type ProtocolAllocations = Record<ProtocolId, number>;

export const DEFAULT_PROTOCOL_ALLOCATIONS: ProtocolAllocations = {
  uniswap: 50_000_000,
  aave: 30_000_000,
  compound: 25_000_000,
  lido: 35_000_000,
};

export const DEFAULT_DEPOSIT_AMOUNT = 500_000;

export type SubAgentConfigItem = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  enabled: boolean;
};

export const DEFAULT_AUTO_SUB_AGENTS: SubAgentConfigItem[] = [
  {
    id: "root-orchestrator",
    name: "Root Orchestrator",
    model: "claude-sonnet-4-6",
    systemPrompt:
      "Portfolio-level strategy and capital routing across protocols. Maximize risk-adjusted yield.",
    enabled: true,
  },
  {
    id: "yield-executor",
    name: "Yield Executor",
    model: "gpt-4o-mini",
    systemPrompt: "Executes rebalances on Aave, Compound, and Lido pools when APR spreads exceed threshold.",
    enabled: true,
  },
  {
    id: "signal-scout",
    name: "Signal Scout",
    model: "gpt-4o-mini",
    systemPrompt: "Monitors APR shifts and publishes buy/sell signals to the agent marketplace.",
    enabled: true,
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    model: "gpt-4o-mini",
    systemPrompt: "Caps exposure per protocol and pauses risky routes when drawdown limits are breached.",
    enabled: true,
  },
];

export const DEFAULT_CUSTOM_SUB_AGENTS: SubAgentConfigItem[] = [
  {
    id: "yield-executor",
    name: "Yield Executor",
    model: "gpt-4o-mini",
    systemPrompt: "Execute yield moves across selected protocols.",
    enabled: true,
  },
  {
    id: "signal-scout",
    name: "Signal Scout",
    model: "gpt-4o-mini",
    systemPrompt: "Scan markets and generate trading signals.",
    enabled: true,
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    model: "gpt-4o-mini",
    systemPrompt: "Limit exposure and halt risky agent actions.",
    enabled: true,
  },
  {
    id: "bridge-scout",
    name: "Bridge Scout",
    model: "gpt-4o-mini",
    systemPrompt: "Find and evaluate cross-chain opportunities.",
    enabled: false,
  },
];

export type AgentStrategyResponse = {
  id: string;
  strategyType: StrategyType;
  status: StrategyStatus;
  depositAmount: number;
  protocolAllocations: ProtocolAllocations;
  subAgents: SubAgentConfigItem[];
  createdAt: string;
  updatedAt: string;
};
