import type { Address } from "viem";
import type { EffectiveRiskLimits } from "./risk-controls.service";
import { createLogger } from "../../shared/logger";
import type { PoolAllocationDrift } from "./trading.types";
import type {
  PoolAllocations,
  StrategyType,
  SubAgentConfigItem,
} from "./strategy.types";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import {
  runOpenAiTradingCycle,
  type OpenAiTradingCycleResult,
} from "../openai/openai-trading.service";
import {
  buildPortfolioContext,
  type ToolExecutionOutcome,
} from "../somnia/quickswap-llm-tools";
import {
  submitSomniaAttestation,
  type SomniaAttestation,
} from "../somnia/somnia-attestation.service";

const log = createLogger("dual-llm-trading");

export type DualLlmTradingCycleResult = OpenAiTradingCycleResult & {
  somniaAttestation: SomniaAttestation;
};

export async function runDualLlmTradingCycle(input: {
  userId: string;
  walletAddress: Address;
  strategyType: StrategyType;
  depositAmount: number;
  lastCycleAt: Date | null;
  poolAllocations: PoolAllocations;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  subAgents: SubAgentConfigItem[];
  activePoolIds: readonly string[];
  riskLimits: EffectiveRiskLimits;
  onToolExecuted?: (outcome: ToolExecutionOutcome) => void;
}): Promise<DualLlmTradingCycleResult> {
  const portfolio = buildPortfolioContext({
    walletAddress: input.walletAddress,
    strategyType: input.strategyType,
    depositAmount: input.depositAmount,
    lastCycleAt: input.lastCycleAt,
    poolAllocations: input.poolAllocations,
    poolDrift: input.poolDrift,
    pools: input.pools,
    balances: input.balances,
    subAgents: input.subAgents,
    riskLimits: input.riskLimits,
  });

  const portfolioSummary = JSON.stringify({
    wallet: portfolio.walletAddress,
    strategyType: portfolio.strategyType,
    poolDrift: portfolio.poolDrift,
    pools: portfolio.pools.map((pool) => pool.id),
  });

  log.info("Starting dual-LLM trading cycle", { userId: input.userId });

  const somniaAttestation = await submitSomniaAttestation({
    userId: input.userId,
    portfolioSummary,
  });

  const openAi = await runOpenAiTradingCycle(input);

  return {
    ...openAi,
    somniaAttestation,
  };
}
