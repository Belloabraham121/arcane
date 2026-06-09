export type PoolId = string;

export type StrategyType = "auto" | "custom";

export type PoolAllocations = Partial<Record<PoolId, number>> &
  Record<string, number>;

export type SubAgentRiskLimits = {
  maxSwapPortfolioPercent?: number;
  maxSlippageBps?: number;
  driftThresholdPercent?: number;
  cycleCooldownMinutes?: number;
};

export type SubAgentConfigItem = {
  id: string;
  name: string;
  systemPrompt: string;
  enabled: boolean;
  limits?: SubAgentRiskLimits;
};

export type AgentStrategy = {
  id: string;
  strategyType: StrategyType;
  status: "draft" | "active";
  depositAmount: number;
  poolAllocations: PoolAllocations;
  subAgents: SubAgentConfigItem[];
  cycleIntervalMinutes: number | null;
  tradingEnabledAt: string | null;
  lastCycleAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_POOL_ALLOCATIONS: PoolAllocations = {
  "usdce-wsomi": 50_000_000,
  "usdce-weth": 30_000_000,
  "wsomi-weth": 25_000_000,
};

export const DEFAULT_DEPOSIT_AMOUNT = 500_000;
