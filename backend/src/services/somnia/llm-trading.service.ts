import type { Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { getTradingExecutionEnv } from "../../config/env";
import type { EffectiveRiskLimits } from "../agents/risk-controls.service";
import { createLogger } from "../../shared/logger";
import { getUserAgentAccount } from "../agents/wallet-executor";
import type { ExecutedTransaction } from "../agents/trading.types";
import type { PoolAllocationDrift } from "../agents/trading.types";
import type {
  PoolAllocations,
  StrategyType,
  SubAgentConfigItem,
} from "../agents/strategy.types";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import { invokeAgent } from "./agent-caller";
import { SomniaAgentError } from "./agent-caller";
import { encodeInferToolsChatPayload } from "./payloads";
import type { InferToolsChatResult } from "./types";
import {
  QUICKSWAP_ONCHAIN_TOOLS,
  appendToolResultsToConversation,
  buildPortfolioContext,
  buildTradingSystemPrompt,
  executeTradingTool,
  type TradingToolContext,
  type ToolExecutionOutcome,
} from "./quickswap-llm-tools";

const log = createLogger("llm-trading");

export type LlmTradingCycleResult = {
  llmResponse: string | null;
  toolActions: ToolExecutionOutcome[];
  executedTransactions: ExecutedTransaction[];
  usedLlm: boolean;
  message: string;
};

function toExecutedTransactions(
  outcomes: ToolExecutionOutcome[],
): ExecutedTransaction[] {
  const txs: ExecutedTransaction[] = [];
  for (const outcome of outcomes) {
    for (const tx of outcome.executedTransactions ?? []) {
      txs.push({
        kind: tx.kind,
        hash: tx.hash,
        status: "success",
      });
    }
  }
  return txs;
}

async function runInferToolsChatRound(
  account: PrivateKeyAccount,
  roles: string[],
  messages: string[],
): Promise<InferToolsChatResult> {
  const { llmMaxIterations } = getTradingExecutionEnv();
  const payload = encodeInferToolsChatPayload({
    roles,
    messages,
    onchainTools: QUICKSWAP_ONCHAIN_TOOLS,
    maxIterations: llmMaxIterations,
    chainOfThought: false,
  });

  const result = await invokeAgent<InferToolsChatResult>(account, {
    method: "inferToolsChat",
    payload,
  });

  return result.decoded;
}

export async function runLlmTradingCycle(input: {
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
}): Promise<LlmTradingCycleResult> {
  const { maxLlmToolRounds } = getTradingExecutionEnv();
  const { driftThresholdPercent } = input.riskLimits;
  const { account } = await getUserAgentAccount(input.userId);

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

  const toolCtx: TradingToolContext = {
    userId: input.userId,
    walletAddress: input.walletAddress,
    activePoolIds: input.activePoolIds,
    poolDrift: input.poolDrift,
    pools: input.pools,
    balances: input.balances,
    portfolio,
    riskLimits: input.riskLimits,
  };

  const systemPrompt = buildTradingSystemPrompt(
    input.strategyType,
    input.subAgents,
    driftThresholdPercent,
  );

  let roles = ["system", "user"];
  let messages = [
    systemPrompt,
    `Portfolio context (JSON):\n${JSON.stringify(portfolio)}`,
  ];

  const toolActions: ToolExecutionOutcome[] = [];

  for (let round = 0; round < maxLlmToolRounds; round++) {
    log.info("LLM inferToolsChat round", {
      userId: input.userId,
      round,
      wallet: account.address,
    });

    let decoded: InferToolsChatResult;
    try {
      decoded = await runInferToolsChatRound(account, roles, messages);
    } catch (err) {
      const detail =
        err instanceof SomniaAgentError
          ? err.message
          : err instanceof Error
            ? err.message
            : "LLM request failed";

      throw new SomniaAgentError(detail, "LLM_CYCLE_FAILED");
    }

    if (decoded.finishReason === "stop") {
      const executedTransactions = toExecutedTransactions(toolActions);
      return {
        llmResponse: decoded.response,
        toolActions,
        executedTransactions,
        usedLlm: true,
        message:
          executedTransactions.length > 0
            ? `LLM cycle completed with ${executedTransactions.length} on-chain action(s).`
            : (decoded.response || "LLM cycle completed — no swaps executed."),
      };
    }

    if (decoded.finishReason !== "tool_calls") {
      return {
        llmResponse: decoded.response || null,
        toolActions,
        executedTransactions: toExecutedTransactions(toolActions),
        usedLlm: true,
        message: `LLM stopped with finishReason=${decoded.finishReason}`,
      };
    }

    roles = [...decoded.updatedRoles];
    messages = [...decoded.updatedMessages];

    const toolResults: string[] = [];
    for (let i = 0; i < decoded.pendingToolCalls.length; i++) {
      const calldata = decoded.pendingToolCalls[i] as Hex;
      const outcome = await executeTradingTool(toolCtx, calldata);
      toolActions.push(outcome);
      toolResults.push(outcome.result);
      input.onToolExecuted?.(outcome);
    }

    const updated = appendToolResultsToConversation(
      roles,
      messages,
      decoded.pendingToolCallIds,
      toolResults,
    );
    roles = updated.roles;
    messages = updated.messages;
  }

  const executedTransactions = toExecutedTransactions(toolActions);
  return {
    llmResponse: null,
    toolActions,
    executedTransactions,
    usedLlm: true,
    message: `LLM reached max tool rounds (${maxLlmToolRounds})`,
  };
}
