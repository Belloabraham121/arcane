import type { AccountMode } from "@prisma/client";
import { createLogger } from "../../shared/logger";
import { findUserById } from "../auth/user.repository";
import { handleStrategyActivation } from "../portfolio/activation.service";
import {
  isUserCycleRunning,
  scheduleTradingCycle,
  shouldTriggerCycleOnActivate,
} from "./trading-runner.service";
import * as repo from "./strategy.repository";
import { isKnownPoolId } from "../defi/quickswap/pool-registry";
import {
  DEFAULT_AUTO_SUB_AGENTS,
  DEFAULT_CUSTOM_SUB_AGENTS,
  DEFAULT_DEMO_DEPOSIT_USD,
  DEFAULT_DEPOSIT_AMOUNT,
  DEFAULT_POOL_ALLOCATIONS,
  type AgentStrategyResponse,
  type PoolAllocations,
  type StrategyType,
  type SubAgentConfigItem,
} from "./strategy.types";

const log = createLogger("agents");

export class StrategyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "StrategyError";
  }
}

export async function parsePoolAllocations(
  input: unknown,
): Promise<PoolAllocations | undefined> {
  if (input == null) {
    return undefined;
  }
  if (typeof input !== "object") {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "poolAllocations must be an object",
    );
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "At least one pool allocation is required",
    );
  }

  const result = {} as PoolAllocations;
  let positiveCount = 0;

  for (const key of keys) {
    if (!(await isKnownPoolId(key))) {
      throw new StrategyError("VALIDATION_ERROR", `Unknown pool: ${key}`);
    }
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `Invalid allocation for ${key}: must be a non-negative number`,
      );
    }
    if (value > 0) {
      positiveCount += 1;
    }
    result[key] = value;
  }

  if (positiveCount === 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "At least one pool must have a positive allocation",
    );
  }

  return result;
}

export function parseSubAgents(
  input: unknown,
): SubAgentConfigItem[] | undefined {
  if (input == null) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    throw new StrategyError("VALIDATION_ERROR", "subAgents must be an array");
  }
  if (input.length === 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "At least one sub-agent is required",
    );
  }

  return input.map((item, index) => {
    if (typeof item !== "object" || item == null) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `Invalid sub-agent at index ${index}`,
      );
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    const name = record.name;
    const systemPrompt = record.systemPrompt;
    const enabled = record.enabled;

    if (typeof id !== "string" || id.trim().length === 0) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `subAgents[${index}].id is required`,
      );
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `subAgents[${index}].name is required`,
      );
    }
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `subAgents[${index}].systemPrompt is required`,
      );
    }
    if (typeof enabled !== "boolean") {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `subAgents[${index}].enabled must be a boolean`,
      );
    }

    let limits: SubAgentConfigItem["limits"];
    if (record.limits != null) {
      if (typeof record.limits !== "object") {
        throw new StrategyError(
          "VALIDATION_ERROR",
          `subAgents[${index}].limits must be an object`,
        );
      }
      const raw = record.limits as Record<string, unknown>;
      limits = {};
      if (raw.maxSwapPortfolioPercent != null) {
        if (
          typeof raw.maxSwapPortfolioPercent !== "number" ||
          raw.maxSwapPortfolioPercent <= 0 ||
          raw.maxSwapPortfolioPercent > 100
        ) {
          throw new StrategyError(
            "VALIDATION_ERROR",
            `subAgents[${index}].limits.maxSwapPortfolioPercent must be 0–100`,
          );
        }
        limits.maxSwapPortfolioPercent = raw.maxSwapPortfolioPercent;
      }
      if (raw.maxSlippageBps != null) {
        if (
          typeof raw.maxSlippageBps !== "number" ||
          raw.maxSlippageBps <= 0 ||
          raw.maxSlippageBps > 10_000
        ) {
          throw new StrategyError(
            "VALIDATION_ERROR",
            `subAgents[${index}].limits.maxSlippageBps must be 1–10000`,
          );
        }
        limits.maxSlippageBps = raw.maxSlippageBps;
      }
      if (raw.driftThresholdPercent != null) {
        if (
          typeof raw.driftThresholdPercent !== "number" ||
          raw.driftThresholdPercent <= 0 ||
          raw.driftThresholdPercent > 100
        ) {
          throw new StrategyError(
            "VALIDATION_ERROR",
            `subAgents[${index}].limits.driftThresholdPercent must be 0–100`,
          );
        }
        limits.driftThresholdPercent = raw.driftThresholdPercent;
      }
      if (raw.cycleCooldownMinutes != null) {
        if (
          typeof raw.cycleCooldownMinutes !== "number" ||
          raw.cycleCooldownMinutes < 1 ||
          raw.cycleCooldownMinutes > 24 * 60
        ) {
          throw new StrategyError(
            "VALIDATION_ERROR",
            `subAgents[${index}].limits.cycleCooldownMinutes must be 1–1440`,
          );
        }
        limits.cycleCooldownMinutes = raw.cycleCooldownMinutes;
      }
    }

    return {
      id: id.trim(),
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      enabled,
      ...(limits ? { limits } : {}),
    };
  });
}

function defaultSubAgentsForType(
  strategyType: StrategyType,
): SubAgentConfigItem[] {
  return strategyType === "auto"
    ? DEFAULT_AUTO_SUB_AGENTS.map((agent) => ({ ...agent }))
    : DEFAULT_CUSTOM_SUB_AGENTS.map((agent) => ({ ...agent }));
}

function subAgentsFromDb(
  strategyType: StrategyType,
  raw: unknown,
): SubAgentConfigItem[] {
  if (raw == null) {
    return defaultSubAgentsForType(strategyType);
  }
  try {
    return parseSubAgents(raw) ?? defaultSubAgentsForType(strategyType);
  } catch {
    return defaultSubAgentsForType(strategyType);
  }
}

function poolAllocationsFromRows(
  rows: { poolId: string; amount: number }[],
): PoolAllocations {
  if (rows.length === 0) {
    return { ...DEFAULT_POOL_ALLOCATIONS };
  }

  const map: PoolAllocations = {};
  for (const row of rows) {
    if (row.poolId) {
      map[row.poolId] = row.amount;
    }
  }

  return Object.keys(map).length > 0 ? map : { ...DEFAULT_POOL_ALLOCATIONS };
}

function parseCycleIntervalMinutes(
  _strategyType: StrategyType,
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "cycleIntervalMinutes must be a number between 5 and 1440",
    );
  }
  if (value < 5 || value > 24 * 60) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "cycleIntervalMinutes must be between 5 and 1440",
    );
  }
  return Math.round(value);
}

async function resolveStrategyAccountMode(
  userId: string,
  modeOverride?: AccountMode,
): Promise<AccountMode> {
  const user = await findUserById(userId);
  const mode = modeOverride ?? user?.accountMode ?? null;
  if (!mode) {
    throw new StrategyError(
      "ACCOUNT_MODE_REQUIRED",
      "Choose demo or live before configuring a strategy",
      400,
    );
  }
  return mode;
}

function toResponse(
  strategy: NonNullable<Awaited<ReturnType<typeof repo.findStrategyByUserId>>>,
): AgentStrategyResponse {
  const strategyType = strategy.strategyType as StrategyType;
  return {
    id: strategy.id,
    accountMode: strategy.accountMode,
    strategyType,
    status: strategy.status as AgentStrategyResponse["status"],
    depositAmount: strategy.depositAmount,
    poolAllocations: poolAllocationsFromRows(strategy.poolAllocations),
    subAgents: subAgentsFromDb(strategyType, strategy.subAgentConfig),
    cycleIntervalMinutes: strategy.cycleIntervalMinutes,
    tradingEnabledAt: strategy.tradingEnabledAt?.toISOString() ?? null,
    lastCycleAt: strategy.lastCycleAt?.toISOString() ?? null,
    createdAt: strategy.createdAt.toISOString(),
    updatedAt: strategy.updatedAt.toISOString(),
  };
}

export async function getUserStrategy(
  userId: string,
  modeOverride?: AccountMode,
): Promise<AgentStrategyResponse | null> {
  const accountMode = await resolveStrategyAccountMode(userId, modeOverride);
  const strategy = await repo.findStrategyByUserId(userId, accountMode);
  if (!strategy) {
    return null;
  }
  return toResponse(strategy);
}

export async function upsertUserStrategy(
  userId: string,
  input: {
    strategyType: StrategyType;
    status?: AgentStrategyResponse["status"];
    depositAmount?: number;
    poolAllocations?: PoolAllocations;
    subAgents?: SubAgentConfigItem[];
    cycleIntervalMinutes?: number | null;
  },
): Promise<AgentStrategyResponse> {
  const status = input.status ?? "draft";
  const accountMode = await resolveStrategyAccountMode(userId);
  const isDemo = accountMode === "demo";

  let depositAmount =
    input.depositAmount ?? (status === "active" ? DEFAULT_DEPOSIT_AMOUNT : 0);

  if (isDemo) {
    depositAmount =
      input.depositAmount ?? (status === "active" ? DEFAULT_DEMO_DEPOSIT_USD : 0);
    if (depositAmount >= 100_000) {
      depositAmount = DEFAULT_DEMO_DEPOSIT_USD;
    }
  }

  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "depositAmount must be a non-negative number",
    );
  }

  if (status === "active" && depositAmount <= 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "depositAmount must be greater than zero to activate strategy",
    );
  }

  const poolAllocations =
    input.poolAllocations ??
    (input.strategyType === "auto"
      ? { ...DEFAULT_POOL_ALLOCATIONS }
      : undefined);

  if (!poolAllocations) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "poolAllocations required for custom strategy",
    );
  }

  const subAgentConfig =
    input.subAgents ??
    (input.strategyType === "auto"
      ? DEFAULT_AUTO_SUB_AGENTS
      : DEFAULT_CUSTOM_SUB_AGENTS);

  const cycleIntervalMinutes =
    input.cycleIntervalMinutes !== undefined
      ? parseCycleIntervalMinutes(
          input.strategyType,
          input.cycleIntervalMinutes,
        )
      : undefined;
  if (input.strategyType === "auto" && input.cycleIntervalMinutes != null) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "cycleIntervalMinutes applies to custom agents only",
    );
  }

  const existing = await repo.findStrategyByUserId(userId, accountMode);
  const activating = status === "active" && existing?.status !== "active";
  const triggerFirstCycle = shouldTriggerCycleOnActivate(
    existing?.status,
    existing?.lastCycleAt,
    status,
    depositAmount,
  );

  const strategy = await repo.upsertStrategy(userId, accountMode, {
    strategyType: input.strategyType,
    depositAmount,
    poolAllocations,
    status,
    subAgentConfig,
    cycleIntervalMinutes,
  });

  log.info("Agent strategy saved", {
    userId,
    accountMode,
    strategyType: input.strategyType,
    depositAmount,
    status,
    triggerFirstCycle,
  });

  if (activating) {
    const activePoolIds = Object.entries(poolAllocations)
      .filter(([, amount]) => amount > 0)
      .map(([id]) => id);
    void handleStrategyActivation({
      userId,
      strategyId: strategy.id,
      manualDepositUsd: depositAmount,
      poolIds: activePoolIds,
    });
  }

  if (
    status === "active" &&
    depositAmount > 0 &&
    !isUserCycleRunning(userId) &&
    (triggerFirstCycle || activating)
  ) {
    scheduleTradingCycle(userId, activating ? "activation" : "scheduled");
  }

  return toResponse(strategy);
}

export async function patchPoolAllocations(
  userId: string,
  poolAllocations: PoolAllocations,
): Promise<AgentStrategyResponse> {
  const accountMode = await resolveStrategyAccountMode(userId);
  const strategy = await repo.updatePoolAllocations(
    userId,
    accountMode,
    poolAllocations,
  );
  if (!strategy) {
    throw new StrategyError(
      "STRATEGY_NOT_FOUND",
      "No agent strategy found for user",
      404,
    );
  }

  log.info("Pool allocations updated", { userId });

  if (
    strategy.status === "active" &&
    strategy.depositAmount > 0 &&
    !isUserCycleRunning(userId)
  ) {
    scheduleTradingCycle(userId, "scheduled");
  }

  return toResponse(strategy);
}

export async function patchSubAgents(
  userId: string,
  subAgents: SubAgentConfigItem[],
): Promise<AgentStrategyResponse> {
  const enabledCount = subAgents.filter((agent) => agent.enabled).length;
  if (enabledCount === 0) {
    throw new StrategyError(
      "VALIDATION_ERROR",
      "At least one sub-agent must be enabled",
    );
  }

  const accountMode = await resolveStrategyAccountMode(userId);
  const strategy = await repo.updateSubAgentConfig(
    userId,
    accountMode,
    subAgents,
  );
  if (!strategy) {
    throw new StrategyError(
      "STRATEGY_NOT_FOUND",
      "No agent strategy found for user",
      404,
    );
  }

  log.info("Sub-agent config updated", { userId, count: subAgents.length });

  return toResponse(strategy);
}
