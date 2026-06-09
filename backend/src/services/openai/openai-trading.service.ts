import type { Address, Hex } from "viem";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getTradingExecutionEnv } from "../../config/env";
import type { EffectiveRiskLimits } from "../agents/risk-controls.service";
import { createLogger } from "../../shared/logger";
import type { ExecutedTransaction } from "../agents/trading.types";
import type { PoolAllocationDrift } from "../agents/trading.types";
import type {
  PoolAllocations,
  StrategyType,
  SubAgentConfigItem,
} from "../agents/strategy.types";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import {
  buildPortfolioContext,
  buildTradingSystemPrompt,
  encodeTradingToolCalldata,
  executeTradingTool,
  type ToolExecutionOutcome,
  type TradingToolContext,
} from "../somnia/quickswap-llm-tools";

const log = createLogger("openai-trading");

export class OpenAiTradingError extends Error {
  constructor(
    message: string,
    readonly code = "OPENAI_TRADING_ERROR",
  ) {
    super(message);
    this.name = "OpenAiTradingError";
  }
}

export type OpenAiTradingCycleResult = {
  llmResponse: string | null;
  toolActions: ToolExecutionOutcome[];
  executedTransactions: ExecutedTransaction[];
  usedLlm: boolean;
  message: string;
  provider: "openai";
};

const OPENAI_TRADING_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "listPools",
      description:
        "List QuickSwap pools the user allocated capital to, with live price and liquidity metrics.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "getPortfolio",
      description:
        "Return agent wallet token balances for all tokens in the user's selected pools.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "quoteSwap",
      description:
        "Read-only swap quote via QuoterV2. amountIn is raw token units (wei) as a decimal string.",
      parameters: {
        type: "object",
        properties: {
          tokenIn: { type: "string", description: "Token in address (0x...)" },
          tokenOut: { type: "string", description: "Token out address (0x...)" },
          amountIn: { type: "string", description: "Raw amount in wei" },
        },
        required: ["tokenIn", "tokenOut", "amountIn"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "swapExactIn",
      description:
        "Execute a single-hop exact-input swap from the agent wallet. amountIn is raw units as a decimal string.",
      parameters: {
        type: "object",
        properties: {
          tokenIn: { type: "string" },
          tokenOut: { type: "string" },
          amountIn: { type: "string" },
        },
        required: ["tokenIn", "tokenOut", "amountIn"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rebalanceToPool",
      description:
        "Move capital toward targetPoolId by swapping from the most overweight pool. amount is raw token units as a decimal string.",
      parameters: {
        type: "object",
        properties: {
          targetPoolId: { type: "string" },
          amount: { type: "string" },
        },
        required: ["targetPoolId", "amount"],
        additionalProperties: false,
      },
    },
  },
];

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAiTradingError(
      "OPENAI_API_KEY is required for trading decisions",
      "OPENAI_NOT_CONFIGURED",
    );
  }
  return new OpenAI({ apiKey });
}

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

function parseToolArgs(
  functionName: string,
  raw: string,
): readonly unknown[] {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  switch (functionName) {
    case "listPools":
    case "getPortfolio":
      return [];
    case "quoteSwap":
    case "swapExactIn":
      return [
        parsed.tokenIn as Address,
        parsed.tokenOut as Address,
        BigInt(String(parsed.amountIn)),
      ];
    case "rebalanceToPool":
      return [String(parsed.targetPoolId), BigInt(String(parsed.amount))];
    default:
      throw new OpenAiTradingError(`Unknown tool: ${functionName}`);
  }
}

function toolCallToCalldata(
  functionName: string,
  argsJson: string,
): Hex {
  const args = parseToolArgs(functionName, argsJson);
  return encodeTradingToolCalldata(functionName, args);
}

export async function runOpenAiTradingCycle(input: {
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
}): Promise<OpenAiTradingCycleResult> {
  const { maxLlmToolRounds, openaiModel } = getTradingExecutionEnv();
  const { driftThresholdPercent } = input.riskLimits;
  const client = getOpenAiClient();

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

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Portfolio context (JSON):\n${JSON.stringify(portfolio)}`,
    },
  ];

  const toolActions: ToolExecutionOutcome[] = [];

  for (let round = 0; round < maxLlmToolRounds; round++) {
    log.info("OpenAI trading round", {
      userId: input.userId,
      round,
      model: openaiModel,
    });

    const completion = await client.chat.completions.create({
      model: openaiModel,
      messages,
      tools: OPENAI_TRADING_TOOLS,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new OpenAiTradingError("OpenAI returned no choices");
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = assistantMessage.content?.trim() ?? "";
      const executedTransactions = toExecutedTransactions(toolActions);
      return {
        llmResponse: text || null,
        toolActions,
        executedTransactions,
        usedLlm: true,
        provider: "openai",
        message:
          executedTransactions.length > 0
            ? `OpenAI cycle completed with ${executedTransactions.length} on-chain action(s).`
            : text || "OpenAI cycle completed — no swaps executed.",
      };
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        continue;
      }

      const functionName = toolCall.function.name;
      const calldata = toolCallToCalldata(
        functionName,
        toolCall.function.arguments,
      );
      const outcome = await executeTradingTool(toolCtx, calldata);
      toolActions.push(outcome);
      input.onToolExecuted?.(outcome);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: outcome.result,
      });
    }
  }

  const executedTransactions = toExecutedTransactions(toolActions);
  return {
    llmResponse: null,
    toolActions,
    executedTransactions,
    usedLlm: true,
    provider: "openai",
    message: `OpenAI reached max tool rounds (${maxLlmToolRounds})`,
  };
}
