import type { SubAgentConfigItem } from "./strategy.types";

export type SubAgentConfigWithLimits = SubAgentConfigItem;

export type EffectiveRiskLimits = {
  maxSwapPortfolioBps: number;
  maxSlippageBps: number;
  driftThresholdPercent: number;
  cycleCooldownMs: number;
  minSwapAmountRaw: bigint;
  minPortfolioBalanceRaw: bigint;
  riskManagerActive: boolean;
};
