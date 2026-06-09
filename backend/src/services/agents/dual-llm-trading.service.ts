import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import type { AllocationMode } from "./trading-recommendations";
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
import {
  runSubAgentPhase,
  type SubAgentOutput,
} from "./sub-agent-orchestrator";
import {
  runMarketplaceSttPreflight,
  type MarketplacePreflightResult,
} from "../marketplace/preflight.js";

const log = createLogger("dual-llm-trading");

export type DualLlmTradingCycleResult = OpenAiTradingCycleResult & {
  somniaAttestation: SomniaAttestation;
  subAgentOutputs: SubAgentOutput[];
  marketplacePreflight: MarketplacePreflightResult;
};

export async function runDualLlmTradingCycle(input: {
  userId: string;
  accountMode: AccountMode;
  allocationMode: AllocationMode;
  walletAddress: Address;
  strategyType: StrategyType;
  depositAmount: number;
  lastCycleAt: Date | null;
  poolAllocations: PoolAllocations;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  subAgents: SubAgentConfigItem[];
  subAgentX402BudgetSttWei?: bigint | null;
  activePoolIds: readonly string[];
  riskLimits: EffectiveRiskLimits;
  onToolExecuted?: (outcome: ToolExecutionOutcome) => void;
  onSubAgentStarted?: (agentId: string, agentName: string) => void;
  onSubAgentCompleted?: (output: SubAgentOutput) => void;
  /** Skip Somnia createRequest (dev simulation). */
  skipSomniaAttestation?: boolean;
  /** Simulate swap/rebalance execution without broadcasting txs. */
  dryRunTrades?: boolean;
}): Promise<DualLlmTradingCycleResult> {
  const portfolio = buildPortfolioContext({
    walletAddress: input.walletAddress,
    strategyType: input.strategyType,
    allocationMode: input.allocationMode,
    userId: input.userId,
    accountMode: input.accountMode,
    activePoolIds: input.activePoolIds,
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

  const marketplacePreflight = await runMarketplaceSttPreflight({
    userId: input.userId,
    subAgents: input.subAgents,
    strategyBudgetSttWei: input.subAgentX402BudgetSttWei,
  });

  if (!marketplacePreflight.ok) {
    log.warn("Marketplace STT preflight failed — sub-agents will skip x402 purchases", {
      userId: input.userId,
      code: marketplacePreflight.code,
      balanceSttWei: marketplacePreflight.balanceSttWei.toString(),
      requiredSttWei: marketplacePreflight.requiredSttWei.toString(),
    });
  } else if (!marketplacePreflight.skipped) {
    log.info("Marketplace STT preflight passed", {
      userId: input.userId,
      walletAddress: marketplacePreflight.walletAddress,
      balanceSttWei: marketplacePreflight.balanceSttWei?.toString(),
      requiredSttWei: marketplacePreflight.requiredSttWei?.toString(),
    });
  }

  const subAgentPhase = await runSubAgentPhase(
    input.subAgents,
    {
      pools: input.pools,
      balances: input.balances,
      poolDrift: input.poolDrift,
      recommendedAction: portfolio.recommendedAction,
      riskLimits: input.riskLimits,
      accountMode: input.accountMode,
    },
    input.onSubAgentCompleted,
    input.onSubAgentStarted,
  );

  const somniaAttestation = input.skipSomniaAttestation
    ? {
        status: "skipped" as const,
        requestId: null,
        txHash: null,
        onChainResponse: null,
        message: "Somnia attestation skipped (demo or simulation mode)",
      }
    : await submitSomniaAttestation({
        userId: input.userId,
        portfolioSummary,
      });

  const openAi = await runOpenAiTradingCycle({
    ...input,
    subAgentContext: subAgentPhase.mergedContext || undefined,
    dryRunTrades: input.dryRunTrades,
  });

  return {
    ...openAi,
    somniaAttestation,
    subAgentOutputs: subAgentPhase.outputs,
    marketplacePreflight,
  };
}
