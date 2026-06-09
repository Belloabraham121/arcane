import type { AccountMode } from "@prisma/client";
import OpenAI from "openai";
import { createLogger } from "../../shared/logger.js";
import type { SubAgentConfigItem } from "./strategy.types.js";
import type { QuickSwapPool } from "../defi/quickswap/types.js";
import type { WalletBalancesResult } from "../wallet/token-balance.service.js";
import type { PoolAllocationDrift } from "./trading.types.js";
import type { EffectiveRiskLimits } from "./risk-controls.types.js";

const log = createLogger("sub-agent-orchestrator");

const SUB_AGENT_MODEL = "gpt-4o-mini";
const SUB_AGENT_MAX_TOKENS = 300;

export type SubAgentOutput = {
  agentId: string;
  agentName: string;
  summary: string;
  data: Record<string, unknown>;
  durationMs: number;
};

export type SubAgentPhaseResult = {
  outputs: SubAgentOutput[];
  mergedContext: string;
};

type RecommendedActionSummary = {
  shouldTrade: boolean;
  reason: string;
  suggestedTool: string;
  fromPoolId?: string;
  toPoolId?: string;
};

type SubAgentContext = {
  pools: QuickSwapPool[];
  balances: WalletBalancesResult;
  poolDrift: PoolAllocationDrift[];
  recommendedAction: RecommendedActionSummary;
  riskLimits: EffectiveRiskLimits;
  accountMode: AccountMode;
};

function buildSubAgentPrompt(
  agent: SubAgentConfigItem,
  context: SubAgentContext,
): string {
  const poolSummary = context.pools.map((p) => ({
    id: p.id,
    label: p.label,
    liquidity: p.metrics.liquidity,
    feeApr: p.metrics.feeApr,
    tvlUsd: p.metrics.totalValueLockedUsd,
    priceLabel: p.metrics.priceLabel,
  }));

  const balanceSummary = context.balances.balances.map((b) => ({
    symbol: b.symbol,
    formatted: b.formatted,
    balance: b.balance,
  }));

  const driftSummary = context.poolDrift.map((d) => ({
    poolId: d.poolId,
    targetPercent: d.targetPercent,
    currentPercent: d.currentPercent,
    driftPercent: d.driftPercent,
  }));

  return [
    `You are "${agent.name}", a specialized read-only sub-agent in a DeFi portfolio system.`,
    `Your role: ${agent.systemPrompt}`,
    "",
    "You CANNOT execute any transactions. You ONLY analyze data and return structured observations.",
    "Be concise — max 2-3 sentences of summary, plus a JSON data object.",
    "",
    "Current portfolio state:",
    `Pools: ${JSON.stringify(poolSummary)}`,
    `Balances: ${JSON.stringify(balanceSummary)}`,
    `Drift: ${JSON.stringify(driftSummary)}`,
    `Recommended action: ${JSON.stringify({
      shouldTrade: context.recommendedAction.shouldTrade,
      reason: context.recommendedAction.reason,
      suggestedTool: context.recommendedAction.suggestedTool,
      fromPoolId: context.recommendedAction.fromPoolId,
      toPoolId: context.recommendedAction.toPoolId,
    })}`,
    `Risk limits: maxSwapBps=${context.riskLimits.maxSwapPortfolioBps}, maxSlippage=${context.riskLimits.maxSlippageBps}, driftThreshold=${context.riskLimits.driftThresholdPercent}%`,
    "",
    "Respond with EXACTLY this JSON format (no markdown, no code fences):",
    '{"summary": "your 2-3 sentence analysis", "data": { ... relevant metrics/flags }}',
  ].join("\n");
}

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for sub-agent calls");
  }
  return new OpenAI({ apiKey });
}

function parseSubAgentResponse(raw: string): { summary: string; data: Record<string, unknown> } {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as { summary?: string; data?: Record<string, unknown> };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : raw.slice(0, 200),
      data: parsed.data && typeof parsed.data === "object" ? parsed.data : {},
    };
  } catch {
    return { summary: raw.slice(0, 200), data: {} };
  }
}

async function runSingleSubAgent(
  agent: SubAgentConfigItem,
  context: SubAgentContext,
): Promise<SubAgentOutput> {
  const start = Date.now();
  const client = getOpenAiClient();

  try {
    const completion = await client.chat.completions.create({
      model: SUB_AGENT_MODEL,
      max_tokens: SUB_AGENT_MAX_TOKENS,
      messages: [
        { role: "user", content: buildSubAgentPrompt(agent, context) },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const { summary, data } = parseSubAgentResponse(raw);

    log.info("Sub-agent completed", {
      agentId: agent.id,
      agentName: agent.name,
      durationMs: Date.now() - start,
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      summary,
      data,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    log.warn("Sub-agent failed, using fallback", {
      agentId: agent.id,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      agentId: agent.id,
      agentName: agent.name,
      summary: `${agent.name}: Analysis unavailable this cycle.`,
      data: { error: true },
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run all enabled sub-agents sequentially (cheap model, no tools, read-only).
 * Returns structured outputs the root agent incorporates into its decision.
 */
export async function runSubAgentPhase(
  subAgents: SubAgentConfigItem[],
  context: SubAgentContext,
  onSubAgentCompleted?: (output: SubAgentOutput) => void,
  onSubAgentStarted?: (agentId: string, agentName: string) => void,
): Promise<SubAgentPhaseResult> {
  const enabled = subAgents.filter(
    (agent) => agent.enabled && agent.id !== "root-orchestrator",
  );

  if (enabled.length === 0) {
    return { outputs: [], mergedContext: "" };
  }

  const outputs: SubAgentOutput[] = [];

  for (const agent of enabled) {
    onSubAgentStarted?.(agent.id, agent.name);
    const output = await runSingleSubAgent(agent, context);
    outputs.push(output);
    onSubAgentCompleted?.(output);
  }

  const mergedContext = outputs
    .map((o) => `[${o.agentName}]: ${o.summary}`)
    .join("\n");

  return { outputs, mergedContext };
}
