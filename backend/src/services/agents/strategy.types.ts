/** Legacy seed slugs kept for default allocations and existing saved strategies. */
export const LEGACY_POOL_IDS = [
  "usdce-wsomi",
  "usdce-weth",
  "wsomi-weth",
] as const;

/** @deprecated Use dynamic pool ids from GET /api/v1/quickswap/pools (subgraph addresses). */
export const POOL_IDS = LEGACY_POOL_IDS;

export type PoolId = string;

export type StrategyType = "auto" | "custom";
export type StrategyStatus = "draft" | "active";

export type PoolAllocations = Record<string, number>;

export const DEFAULT_POOL_ALLOCATIONS: PoolAllocations = {
  "usdce-wsomi": 50_000_000,
  "usdce-weth": 30_000_000,
  "wsomi-weth": 25_000_000,
};

export const DEFAULT_DEPOSIT_AMOUNT = 500_000;

/** Optional hard limits on a sub-agent (typically risk-manager). */
export type SubAgentRiskLimits = {
  maxSwapPortfolioPercent?: number;
  maxSlippageBps?: number;
  driftThresholdPercent?: number;
  cycleCooldownMinutes?: number;
};

export type SubAgentConfigItem = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  /** Optional hard limits (typically on risk-manager). */
  limits?: SubAgentRiskLimits;
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
    systemPrompt:
      "Monitors APR shifts and publishes buy/sell signals to the agent marketplace.",
    enabled: true,
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    model: "gpt-4o-mini",
    systemPrompt:
      "Caps exposure per QuickSwap pool and pauses risky routes when drawdown limits are breached.",
    enabled: true,
    limits: {
      maxSwapPortfolioPercent: 15,
      maxSlippageBps: 50,
      driftThresholdPercent: 6,
      cycleCooldownMinutes: 5,
    },
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
    limits: {
      maxSwapPortfolioPercent: 15,
      maxSlippageBps: 50,
      driftThresholdPercent: 6,
      cycleCooldownMinutes: 5,
    },
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
  /** Custom agents only — minutes between scheduled trading cycles. */
  cycleIntervalMinutes: number | null;
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  createdAt: string;
  updatedAt: string;
};
