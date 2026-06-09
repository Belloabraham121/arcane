import type { Address, Hex } from "viem";
import { decodeFunctionData, encodeFunctionData, parseAbi } from "viem";
import {
  assertPoolInAllocations,
  capSwapAmountByPolicy,
  type EffectiveRiskLimits,
  resolveSlippageBps,
} from "../agents/risk-controls.service";
import { listPoolsWithMetrics } from "../defi/quickswap/pool-metrics.service";
import { planRebalance } from "../defi/quickswap/route-planner";
import { quoteExactIn } from "../defi/quickswap/quote.service";
import {
  executeRebalancePlan,
  executeSwapExactIn,
} from "../agents/wallet-executor";
import type { PoolAllocationDrift } from "../agents/trading.types";
import type {
  PoolAllocations,
  StrategyType,
  SubAgentConfigItem,
} from "../agents/strategy.types";
import {
  DEFAULT_AUTO_SUB_AGENTS,
  DEFAULT_CUSTOM_SUB_AGENTS,
} from "../agents/strategy.types";
import type { QuickSwapPool } from "../defi/quickswap/types";
import type { WalletBalancesResult } from "../wallet/token-balance.service";
import type { OnchainToolDef } from "./types";

export const QUICKSWAP_TOOLS_ABI = parseAbi([
  "function listPools()",
  "function getPortfolio()",
  "function quoteSwap(address tokenIn, address tokenOut, uint256 amountIn)",
  "function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn)",
  "function rebalanceToPool(string targetPoolId, uint256 amount)",
]);

export const QUICKSWAP_ONCHAIN_TOOLS: OnchainToolDef[] = [
  {
    signature: "listPools()",
    description:
      "List QuickSwap pools the user allocated capital to, with live price and liquidity metrics.",
  },
  {
    signature: "getPortfolio()",
    description:
      "Return agent wallet token balances for all tokens in the user's selected pools.",
  },
  {
    signature: "quoteSwap(address tokenIn, address tokenOut, uint256 amountIn)",
    description:
      "Read-only swap quote via QuoterV2. amountIn is raw token units (wei).",
  },
  {
    signature: "swapExactIn(address tokenIn, address tokenOut, uint256 amountIn)",
    description:
      "Execute a single-hop exact-input swap from the agent wallet (auto-approve). amountIn is raw units.",
  },
  {
    signature: "rebalanceToPool(string targetPoolId, uint256 amount)",
    description:
      "Move capital toward targetPoolId by swapping from the most overweight pool. amount is raw token units of the sold leg.",
  },
];

export type TradingPortfolioContext = {
  walletAddress: Address;
  strategyType: StrategyType;
  depositAmount: number;
  lastCycleAt: string | null;
  driftThresholdPercent: number;
  maxSwapPortfolioBps: number;
  maxSlippageBps: number;
  cycleCooldownMinutes: number;
  riskManagerActive: boolean;
  poolAllocations: PoolAllocations;
  poolDrift: PoolAllocationDrift[];
  balances: WalletBalancesResult["balances"];
  pools: Array<{
    id: string;
    label: string;
    token0: string;
    token1: string;
    priceLabel: string | null;
    liquidity: string;
    feeTierPercent: number | null;
  }>;
  subAgents: Array<{ id: string; name: string; enabled: boolean; systemPrompt: string }>;
};

export type TradingToolContext = {
  userId: string;
  walletAddress: Address;
  activePoolIds: readonly string[];
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  portfolio: TradingPortfolioContext;
  riskLimits: EffectiveRiskLimits;
};

export class TradingToolError extends Error {
  constructor(
    message: string,
    readonly code = "TRADING_TOOL_ERROR",
  ) {
    super(message);
    this.name = "TradingToolError";
  }
}

export function resolveSubAgents(
  strategyType: StrategyType,
  subAgentConfig: unknown,
): SubAgentConfigItem[] {
  if (Array.isArray(subAgentConfig) && subAgentConfig.length > 0) {
    return subAgentConfig as SubAgentConfigItem[];
  }
  return strategyType === "auto"
    ? DEFAULT_AUTO_SUB_AGENTS
    : DEFAULT_CUSTOM_SUB_AGENTS;
}

export function buildTradingSystemPrompt(
  strategyType: StrategyType,
  subAgents: SubAgentConfigItem[],
  driftThresholdPercent: number,
): string {
  const enabledAgents = subAgents
    .filter((agent) => agent.enabled)
    .map((agent) => `- ${agent.name}: ${agent.systemPrompt}`)
    .join("\n");

  if (strategyType === "auto") {
    return [
      "You are an autonomous DeFi portfolio agent on Somnia QuickSwap (auto strategy).",
      "Pools were pre-selected for high liquidity and implied fee APR. Prioritise yield: rotate capital toward higher-APR pools when drift allows.",
      `Rebalance when allocation drift exceeds ${driftThresholdPercent}% or a materially better APR/liquidity opportunity appears.`,
      "Use quoteSwap before swapExactIn when unsure. Prefer rebalanceToPool for pool-to-pool moves.",
      "Never swap tokens outside the user's selected pools. Respect max single-move limits in the portfolio context.",
      "Sub-agent guidance:",
      enabledAgents,
    ].join("\n");
  }

  return [
    "You are a custom QuickSwap portfolio agent. The user manually chose pools and target allocations.",
    `Only trade within those pools. Rebalance when drift exceeds ${driftThresholdPercent}% while respecting user constraints and sub-agent rules.`,
    "Do not expand into pools outside the user's selection. Honour their allocation weights as the primary objective.",
    "Use quoteSwap for read-only checks. Use swapExactIn or rebalanceToPool to execute.",
    "Sub-agent configuration:",
    enabledAgents,
  ].join("\n");
}

export function buildPortfolioContext(input: {
  walletAddress: Address;
  strategyType: StrategyType;
  depositAmount: number;
  lastCycleAt: Date | null;
  poolAllocations: PoolAllocations;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  subAgents: SubAgentConfigItem[];
  riskLimits: EffectiveRiskLimits;
}): TradingPortfolioContext {
  const { driftThresholdPercent, maxSwapPortfolioBps } = input.riskLimits;
  const activeIds = new Set(
    (Object.entries(input.poolAllocations) as Array<[string, number]>)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id),
  );

  return {
    walletAddress: input.walletAddress,
    strategyType: input.strategyType,
    depositAmount: input.depositAmount,
    lastCycleAt: input.lastCycleAt?.toISOString() ?? null,
    driftThresholdPercent,
    maxSwapPortfolioBps,
    maxSlippageBps: input.riskLimits.maxSlippageBps,
    cycleCooldownMinutes: Math.round(
      input.riskLimits.cycleCooldownMs / 60_000,
    ),
    riskManagerActive: input.riskLimits.riskManagerActive,
    poolAllocations: input.poolAllocations,
    poolDrift: input.poolDrift,
    balances: input.balances.balances,
    pools: input.pools
      .filter((pool) => activeIds.has(pool.id))
      .map((pool) => ({
        id: pool.id,
        label: pool.label,
        token0: `${pool.token0.symbol} (${pool.token0.address})`,
        token1: `${pool.token1.symbol} (${pool.token1.address})`,
        priceLabel: pool.metrics.priceLabel,
        liquidity: pool.metrics.liquidity,
        feeTierPercent: pool.metrics.feeTierPercent,
        feeAprPercent: pool.metrics.feeApr,
        tvlUsd: pool.metrics.totalValueLockedUsd,
        volumeUsd: pool.metrics.volumeUsd,
      })),
    subAgents: input.subAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      systemPrompt: agent.systemPrompt,
    })),
  };
}

function pickOverweightPoolId(drift: PoolAllocationDrift[]): string | null {
  const overweight = drift
    .filter((entry) => entry.driftPercent > 0)
    .sort((a, b) => b.driftPercent - a.driftPercent)[0];
  return overweight?.poolId ?? null;
}

export function encodeTradingToolCalldata(
  functionName: string,
  args: readonly unknown[],
): Hex {
  return encodeFunctionData({
    abi: QUICKSWAP_TOOLS_ABI,
    functionName: functionName as
      | "listPools"
      | "getPortfolio"
      | "quoteSwap"
      | "swapExactIn"
      | "rebalanceToPool",
    args: args as never,
  });
}

export function decodeToolCalldata(
  calldata: Hex,
): { functionName: string; args: readonly unknown[] } {
  const decoded = decodeFunctionData({
    abi: QUICKSWAP_TOOLS_ABI,
    data: calldata,
  });
  return {
    functionName: decoded.functionName,
    args: decoded.args ?? [],
  };
}

export type ToolExecutionOutcome = {
  tool: string;
  success: boolean;
  result: string;
  executedTransactions?: Array<{
    kind: "approve" | "swap";
    hash: string;
  }>;
};

export async function executeTradingTool(
  ctx: TradingToolContext,
  calldata: Hex,
): Promise<ToolExecutionOutcome> {
  const { functionName, args } = decodeToolCalldata(calldata);

  try {
    switch (functionName) {
      case "listPools": {
        const pools = await listPoolsWithMetrics();
        const active = new Set(ctx.activePoolIds);
        const filtered = pools.filter((pool) => active.has(pool.id));
        return {
          tool: functionName,
          success: true,
          result: JSON.stringify(filtered),
        };
      }

      case "getPortfolio": {
        return {
          tool: functionName,
          success: true,
          result: JSON.stringify(ctx.balances),
        };
      }

      case "quoteSwap": {
        const [tokenIn, tokenOut, amountIn] = args as [Address, Address, bigint];
        const quote = await quoteExactIn(tokenIn, tokenOut, amountIn);
        return {
          tool: functionName,
          success: true,
          result: JSON.stringify(quote),
        };
      }

      case "swapExactIn": {
        const [tokenIn, tokenOut, amountIn] = args as [Address, Address, bigint];
        const balance = ctx.balances.balances.find(
          (row) => row.address?.toLowerCase() === tokenIn.toLowerCase(),
        );
        const balanceRaw = balance ? BigInt(balance.balance) : 0n;
        const capped = capSwapAmountByPolicy(
          amountIn,
          balanceRaw,
          ctx.riskLimits,
        );
        if (capped <= 0n) {
          throw new TradingToolError("Swap amount is zero after risk caps");
        }

        const slippageBps = resolveSlippageBps(undefined, ctx.riskLimits);
        const txs = await executeSwapExactIn({
          userId: ctx.userId,
          tokenIn,
          tokenOut,
          amountIn: capped,
          allowedPoolIds: ctx.activePoolIds,
          slippageBps,
          riskLimits: ctx.riskLimits,
        });

        return {
          tool: functionName,
          success: true,
          result: JSON.stringify({
            amountIn: capped.toString(),
            transactions: txs.map((tx) => tx.hash),
          }),
          executedTransactions: txs.map((tx) => ({
            kind: tx.kind,
            hash: tx.hash,
          })),
        };
      }

      case "rebalanceToPool": {
        const [targetPoolId, amount] = args as [string, bigint];
        assertPoolInAllocations(targetPoolId, ctx.activePoolIds);

        const fromPoolId = pickOverweightPoolId(ctx.poolDrift);
        if (!fromPoolId) {
          throw new TradingToolError("No overweight pool found for rebalance source");
        }
        if (fromPoolId === targetPoolId) {
          throw new TradingToolError("Source and target pools are the same");
        }

        const plan = await planRebalance(
          fromPoolId,
          targetPoolId,
          amount,
          ctx.walletAddress,
        );

        if (plan.kind === "no_swap") {
          return {
            tool: functionName,
            success: true,
            result: JSON.stringify({ kind: "no_swap", reason: plan.reason }),
          };
        }

        const sourceBalance = ctx.balances.balances.find(
          (row) => row.address?.toLowerCase() === plan.tokenIn.toLowerCase(),
        );
        const cappedAmount = capSwapAmountByPolicy(
          plan.amountIn,
          BigInt(sourceBalance?.balance ?? 0n),
          ctx.riskLimits,
        );
        if (cappedAmount <= 0n) {
          throw new TradingToolError("Rebalance amount is zero after risk caps");
        }

        const cappedPlan =
          cappedAmount < plan.amountIn
            ? { ...plan, amountIn: cappedAmount }
            : plan;

        const slippageBps = resolveSlippageBps(undefined, ctx.riskLimits);
        const txs = await executeRebalancePlan({
          userId: ctx.userId,
          plan: cappedPlan,
          allowedPoolIds: ctx.activePoolIds,
          slippageBps,
          riskLimits: ctx.riskLimits,
        });

        return {
          tool: functionName,
          success: true,
          result: JSON.stringify({
            fromPoolId,
            targetPoolId,
            amountIn: cappedPlan.amountIn.toString(),
            transactions: txs.map((tx) => tx.hash),
          }),
          executedTransactions: txs.map((tx) => ({
            kind: tx.kind,
            hash: tx.hash,
          })),
        };
      }

      default:
        throw new TradingToolError(`Unknown tool: ${functionName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return {
      tool: functionName,
      success: false,
      result: JSON.stringify({ error: message }),
    };
  }
}

export function appendToolResultsToConversation(
  roles: string[],
  messages: string[],
  toolCallIds: string[],
  toolResults: string[],
): { roles: string[]; messages: string[] } {
  const nextRoles = [...roles];
  const nextMessages = [...messages];

  for (let i = 0; i < toolCallIds.length; i++) {
    nextRoles.push("tool");
    nextMessages.push(
      JSON.stringify({
        tool_call_id: toolCallIds[i],
        content: toolResults[i] ?? "",
      }),
    );
  }

  return { roles: nextRoles, messages: nextMessages };
}
