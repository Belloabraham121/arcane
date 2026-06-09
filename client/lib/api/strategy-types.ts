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

export type MarketplaceProductPricesSttWei = {
  "pools/snapshot": string;
  "signals/spread": string;
  "signals/cross-chain": string;
};

export type MarketplaceSummary = {
  enabled: boolean;
  paymentAsset: "STT";
  facilitatorUrl: string;
  sellerAddress: string | null;
  chainId: number;
  budgetSttWei: string;
  spendSttWei: string;
  remainingSttWei: string;
  productPricesSttWei: MarketplaceProductPricesSttWei;
};

export type AgentStrategy = {
  id: string;
  accountMode: "demo" | "live";
  strategyType: StrategyType;
  status: "draft" | "active";
  depositAmount: number;
  poolAllocations: PoolAllocations;
  subAgents: SubAgentConfigItem[];
  cycleIntervalMinutes: number | null;
  subAgentX402BudgetSttWei: string | null;
  marketplace: MarketplaceSummary;
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

/** Live strategies use wallet-detected USD at activation — no placeholder default. */
export const DEFAULT_DEPOSIT_AMOUNT = 0;

/** Demo simulation baseline label (not a real deposit). */
export const DEFAULT_DEMO_DEPOSIT_AMOUNT = 1_000;
