export const POOL_IDS = ["usdce-wsomi", "usdce-weth", "wsomi-weth"] as const;
export type PoolId = (typeof POOL_IDS)[number];

export type StrategyType = "auto" | "custom";
export type StrategyStatus = "draft" | "active";

export type PoolAllocations = Record<PoolId, number>;

export const DEFAULT_POOL_ALLOCATIONS: PoolAllocations = {
  "usdce-wsomi": 50_000_000,
  "usdce-weth": 30_000_000,
  "wsomi-weth": 25_000_000,
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
      "Portfolio-level strategy and capital routing across QuickSwap pools. Maximize risk-adjusted yield.",
    enabled: true,
  },
  {
    id: "yield-executor",
    name: "Yield Executor",
    model: "gpt-4o-mini",
    systemPrompt:
      "Executes rebalances across QuickSwap liquidity pools when price and fee spreads exceed threshold.",
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
    systemPrompt:
      "Caps exposure per QuickSwap pool and pauses risky routes when drawdown limits are breached.",
    enabled: true,
  },
];

export const DEFAULT_CUSTOM_SUB_AGENTS: SubAgentConfigItem[] = [
  {
    id: "yield-executor",
    name: "Yield Executor",
    model: "gpt-4o-mini",
    systemPrompt: "Execute capital moves across selected QuickSwap pools.",
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
  poolAllocations: PoolAllocations;
  subAgents: SubAgentConfigItem[];
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  createdAt: string;
  updatedAt: string;
};
