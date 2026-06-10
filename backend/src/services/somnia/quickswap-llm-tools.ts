import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import { decodeFunctionData, encodeFunctionData, parseAbi } from "viem";
import {
  assertPoolInAllocations,
  capSwapAmountByPolicy,
  type EffectiveRiskLimits,
  resolveSlippageBps,
} from "../agents/risk-controls.service";
import {
  type AllocationMode,
  buildTradingRecommendation,
} from "../agents/trading-recommendations";
import {
  liquidPoolsOnly,
  planRebalance,
  poolHasTradeableLiquidity,
} from "../defi/quickswap/route-planner";
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
import { resolveToolAmountIn } from "../../utils/token-amount";
import type { OnchainToolDef } from "./types";

export const QUICKSWAP_TOOLS_ABI = parseAbi([
  "function listPools()",
  "function getPortfolio()",
  "function quoteSwap(address tokenIn, address tokenOut, uint256 amountIn)",
  "function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn)",
  "function rebalanceToPool(string targetPoolId, uint256 amount)",
]);

function simulatedTxHash(seed: string): `0x${string}` {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 64);
  return `0x${hex}`;
}

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
      "Move capital toward targetPoolId by swapping from recommendedAction.fromPoolId (or best source pool). amount is raw token units of the sold leg.",
  },
];

export type TradingPortfolioContext = {
  walletAddress: Address;
  strategyType: StrategyType;
  allocationMode: AllocationMode;
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
  recommendedAction: {
    shouldTrade: boolean;
    reason: string;
    suggestedTool: string;
    fromPoolId?: string;
    toPoolId?: string;
    tokenIn?: { address: string; symbol: string };
    tokenOut?: { address: string; symbol: string };
    amountInRaw?: string;
    amountInHint?: string;
    tokenDecimals?: number;
    tradeablePoolIds: string[];
  };
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
  /** When true, swap/rebalance tools return simulated success (no on-chain txs). */
  dryRun?: boolean;
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

function normalizeSubAgentRecord(raw: unknown): SubAgentConfigItem | null {
  if (typeof raw !== "object" || raw == null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.systemPrompt !== "string" ||
    typeof record.enabled !== "boolean"
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    systemPrompt: record.systemPrompt,
    enabled: record.enabled,
    ...(record.limits != null && typeof record.limits === "object"
      ? { limits: record.limits as SubAgentConfigItem["limits"] }
      : {}),
  };
}

export function resolveSubAgents(
  strategyType: StrategyType,
  subAgentConfig: unknown,
): SubAgentConfigItem[] {
  if (Array.isArray(subAgentConfig) && subAgentConfig.length > 0) {
    const parsed = subAgentConfig
      .map(normalizeSubAgentRecord)
      .filter((agent): agent is SubAgentConfigItem => agent != null);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return strategyType === "auto"
    ? DEFAULT_AUTO_SUB_AGENTS
    : DEFAULT_CUSTOM_SUB_AGENTS;
}

export function buildTradingSystemPrompt(
  strategyType: StrategyType,
  subAgents: SubAgentConfigItem[],
  driftThresholdPercent: number,
  allocationMode: AllocationMode = "strict",
): string {
  const enabledAgents = subAgents
    .filter((agent) => agent.enabled)
    .map((agent) => `- ${agent.name}: ${agent.systemPrompt}`)
    .join("\n");

  const exploratoryRules =
    allocationMode === "exploratory"
      ? [
          "Setup pool percentages are SOFT HINTS only — you are NOT required to match 50/25/25 or any target split.",
          "Freely rotate and rebalance across ANY of the user's selected liquid pools based on fees, APR, liquidity, and quotes.",
          "Each cycle, prefer recommendedAction's fromPoolId→toPoolId rotation but you MAY choose a different selected pool pair if quotes are better.",
        ]
      : [];

  const executionRules = [
    "You are fully autonomous — NEVER ask the user for confirmation, permission, or whether to proceed.",
    "TOOLS THAT SUBMIT ON-CHAIN TXS: swapExactIn and rebalanceToPool (agent wallet signs automatically).",
    "Each cycle: call listPools + getPortfolio first, then follow portfolio.recommendedAction.",
    "When recommendedAction.shouldTrade is true: quoteSwap then EXECUTE with rebalanceToPool or swapExactIn in this cycle.",
    "When pools share the same token pair, use recommendedAction.tokenIn/tokenOut and rebalanceToPool — do not skip as analysis-only.",
    "AMOUNTS: always use balances[].balance or recommendedAction.amountInRaw (integer string). NEVER use balances[].formatted.",
    "Example: 1 WSOMI = \"1000000000000000000\" (18 decimals). 1 USDCe = \"1000000\" (6 decimals).",
    "Do not end the cycle with analysis only if shouldTrade is true and quotes succeed — you must attempt execution.",
    "Only use pools in recommendedAction.tradeablePoolIds for routing. Skip zero-liquidity pools.",
    allocationMode === "strict"
      ? `Hard drift cap: ${driftThresholdPercent}%. Proactive threshold may be lower (see recommendedAction).`
      : "Drift vs setup weights is informational only — trade for opportunity across selected pools.",
    "Never swap tokens outside the user's selected pools. Respect maxSwapPortfolioBps.",
    "End with a brief execution summary only — no questions to the user.",
    ...exploratoryRules,
  ];

  if (strategyType === "auto") {
    return [
      "You are an autonomous DeFi portfolio agent on Somnia QuickSwap (auto strategy).",
      allocationMode === "exploratory"
        ? "Explore yield across the user's selected pools; rotate exposure freely."
        : "Prioritise yield and keep allocations near targets by executing smart rebalances when recommended.",
      ...executionRules,
      "Sub-agent guidance:",
      enabledAgents,
    ].join("\n");
  }

  return [
    "You are a custom QuickSwap portfolio agent.",
    allocationMode === "exploratory"
      ? "User selected which pools you may use — weights are hints, not hard constraints."
      : "Honour user pool selection and target weights.",
    ...executionRules,
    "Sub-agent configuration:",
    enabledAgents,
  ].join("\n");
}

export function buildPortfolioContext(input: {
  walletAddress: Address;
  strategyType: StrategyType;
  allocationMode?: AllocationMode;
  userId?: string;
  accountMode?: import("@prisma/client").AccountMode;
  activePoolIds?: readonly string[];
  depositAmount: number;
  lastCycleAt: Date | null;
  poolAllocations: PoolAllocations;
  poolDrift: PoolAllocationDrift[];
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  subAgents: SubAgentConfigItem[];
  riskLimits: EffectiveRiskLimits;
}): TradingPortfolioContext {
  const allocationMode = input.allocationMode ?? "strict";
  const { driftThresholdPercent, maxSwapPortfolioBps } = input.riskLimits;
  const activeIds = new Set(
    (Object.entries(input.poolAllocations) as Array<[string, number]>)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id),
  );

  return {
    walletAddress: input.walletAddress,
    strategyType: input.strategyType,
    allocationMode,
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
    recommendedAction: buildTradingRecommendation({
      poolDrift: input.poolDrift,
      pools: input.pools,
      balances: input.balances,
      riskLimits: input.riskLimits,
      allocationMode,
      userId: input.userId,
      accountMode: input.accountMode,
      activePoolIds: input.activePoolIds,
    }),
  };
}

function pickOverweightPoolId(
  drift: PoolAllocationDrift[],
  pools: readonly QuickSwapPool[],
): string | null {
  const liquidIds = new Set(liquidPoolsOnly(pools).map((pool) => pool.id));
  const overweight = drift
    .filter(
      (entry) => entry.driftPercent > 0 && liquidIds.has(entry.poolId),
    )
    .sort((a, b) => b.driftPercent - a.driftPercent)[0];
  return overweight?.poolId ?? null;
}

function balanceRowForToken(
  ctx: TradingToolContext,
  tokenAddress: Address,
) {
  return ctx.balances.balances.find(
    (row) => row.address?.toLowerCase() === tokenAddress.toLowerCase(),
  );
}

function resolveAmountForToken(
  ctx: TradingToolContext,
  tokenAddress: Address,
  requested: bigint,
): ReturnType<typeof resolveToolAmountIn> {
  const row = balanceRowForToken(ctx, tokenAddress);
  const rec = ctx.portfolio.recommendedAction;
  const recommendedRaw =
    rec.tokenIn?.address.toLowerCase() === tokenAddress.toLowerCase() &&
    rec.amountInRaw
      ? BigInt(rec.amountInRaw)
      : null;

  return resolveToolAmountIn({
    requested,
    tokenAddress,
    balanceRaw: row ? BigInt(row.balance) : 0n,
    decimals: row?.decimals ?? rec.tokenDecimals ?? 18,
    minSwapAmountRaw: ctx.riskLimits.minSwapAmountRaw,
    recommendedRaw,
  });
}

function poolsForListTool(
  ctx: TradingToolContext,
): Array<Record<string, unknown>> {
  const active = new Set(ctx.activePoolIds);
  return ctx.pools
    .filter((pool) => active.has(pool.id))
    .map((pool) => ({
      id: pool.id,
      label: pool.label,
      address: pool.address,
      token0: pool.token0.symbol,
      token1: pool.token1.symbol,
      liquidity: pool.metrics.liquidity,
      tradeable: poolHasTradeableLiquidity(pool),
      priceLabel: pool.metrics.priceLabel,
      feeTierPercent: pool.metrics.feeTierPercent,
      tvlUsd: pool.metrics.totalValueLockedUsd,
    }));
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
        return {
          tool: functionName,
          success: true,
          result: JSON.stringify(poolsForListTool(ctx)),
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
        const resolved = resolveAmountForToken(ctx, tokenIn, amountIn);
        const quote = await quoteExactIn(tokenIn, tokenOut, resolved.amount);
        if (BigInt(quote.amountOut) <= 0n) {
          throw new TradingToolError(
            `Quote returned zero output. Use recommendedAction.amountInRaw (${ctx.portfolio.recommendedAction.amountInRaw ?? "n/a"}) — not formatted balances.`,
          );
        }
        return {
          tool: functionName,
          success: true,
          result: JSON.stringify({
            ...quote,
            amountInUsed: resolved.amount.toString(),
            amountCorrected: resolved.corrected,
            correctionReason: resolved.reason ?? null,
          }),
        };
      }

      case "swapExactIn": {
        const [tokenIn, tokenOut, rawAmountIn] = args as [Address, Address, bigint];
        const resolved = resolveAmountForToken(ctx, tokenIn, rawAmountIn);
        const amountIn = resolved.amount;

        if (ctx.dryRun) {
          return {
            tool: functionName,
            success: true,
            result: JSON.stringify({
              simulated: true,
              tokenIn,
              tokenOut,
              amountIn: amountIn.toString(),
            }),
            executedTransactions: [
              {
                kind: "swap",
                hash: simulatedTxHash(
                  `swap:${tokenIn}:${tokenOut}:${amountIn.toString()}`,
                ),
              },
            ],
          };
        }

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
            amountCorrected: resolved.corrected,
            correctionReason: resolved.reason ?? null,
            transactions: txs.map((tx) => tx.hash),
          }),
          executedTransactions: txs.map((tx) => ({
            kind: tx.kind,
            hash: tx.hash,
          })),
        };
      }

      case "rebalanceToPool": {
        const [targetPoolId, rawAmount] = args as [string, bigint];
        assertPoolInAllocations(targetPoolId, ctx.activePoolIds);

        const rec = ctx.portfolio.recommendedAction;
        const tokenInAddr = rec.tokenIn?.address;
        const resolved = tokenInAddr
          ? resolveAmountForToken(ctx, tokenInAddr, rawAmount)
          : { amount: rawAmount, corrected: false as const };
        const amount = resolved.amount;

        if (ctx.dryRun) {
          const fromPoolId =
            pickOverweightPoolId(ctx.poolDrift, ctx.pools) ?? "sim-from";
          return {
            tool: functionName,
            success: true,
            result: JSON.stringify({
              simulated: true,
              fromPoolId,
              targetPoolId,
              amountIn: amount.toString(),
            }),
            executedTransactions: [
              {
                kind: "swap",
                hash: simulatedTxHash(
                  `rebalance:${fromPoolId}:${targetPoolId}:${amount.toString()}`,
                ),
              },
            ],
          };
        }

        const fromPoolId =
          rec.fromPoolId ?? pickOverweightPoolId(ctx.poolDrift, ctx.pools);
        if (!fromPoolId) {
          throw new TradingToolError(
            "No source pool with tradeable liquidity found for rebalance",
          );
        }
        if (fromPoolId === targetPoolId) {
          throw new TradingToolError("Source and target pools are the same");
        }

        const planOptions: {
          pools: typeof ctx.pools;
          tokenIn?: Address;
          tokenOut?: Address;
        } = { pools: ctx.pools };
        if (rec.tokenIn?.address) {
          planOptions.tokenIn = rec.tokenIn.address;
        }
        if (rec.tokenOut?.address) {
          planOptions.tokenOut = rec.tokenOut.address;
        }

        const plan = await planRebalance(
          fromPoolId,
          targetPoolId,
          amount,
          ctx.walletAddress,
          planOptions,
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
            amountCorrected: resolved.corrected,
            correctionReason: resolved.reason ?? null,
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
