import { createLogger } from "../../shared/logger";
import {
  scheduleTradingCycle,
  shouldTriggerCycleOnActivate,
} from "./trading-runner.service";
import * as repo from "./strategy.repository";
import {
  DEFAULT_AUTO_SUB_AGENTS,
  DEFAULT_CUSTOM_SUB_AGENTS,
  DEFAULT_DEPOSIT_AMOUNT,
  DEFAULT_POOL_ALLOCATIONS,
  POOL_IDS,
  type AgentStrategyResponse,
  type PoolAllocations,
  type PoolId,
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

function isPoolId(value: string): value is PoolId {
  return (POOL_IDS as readonly string[]).includes(value);
}

export function parsePoolAllocations(input: unknown): PoolAllocations | undefined {
  if (input == null) {
    return undefined;
  }
  if (typeof input !== "object") {
    throw new StrategyError("VALIDATION_ERROR", "poolAllocations must be an object");
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    throw new StrategyError("VALIDATION_ERROR", "At least one pool allocation is required");
  }

  const result = {} as PoolAllocations;
  let positiveCount = 0;

  for (const key of keys) {
    if (!isPoolId(key)) {
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

export function parseSubAgents(input: unknown): SubAgentConfigItem[] | undefined {
  if (input == null) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    throw new StrategyError("VALIDATION_ERROR", "subAgents must be an array");
  }
  if (input.length === 0) {
    throw new StrategyError("VALIDATION_ERROR", "At least one sub-agent is required");
  }

  return input.map((item, index) => {
    if (typeof item !== "object" || item == null) {
      throw new StrategyError("VALIDATION_ERROR", `Invalid sub-agent at index ${index}`);
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    const name = record.name;
    const model = record.model;
    const systemPrompt = record.systemPrompt;
    const enabled = record.enabled;

    if (typeof id !== "string" || id.trim().length === 0) {
      throw new StrategyError("VALIDATION_ERROR", `subAgents[${index}].id is required`);
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new StrategyError("VALIDATION_ERROR", `subAgents[${index}].name is required`);
    }
    if (typeof model !== "string" || model.trim().length === 0) {
      throw new StrategyError("VALIDATION_ERROR", `subAgents[${index}].model is required`);
    }
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      throw new StrategyError("VALIDATION_ERROR", `subAgents[${index}].systemPrompt is required`);
    }
    if (typeof enabled !== "boolean") {
      throw new StrategyError("VALIDATION_ERROR", `subAgents[${index}].enabled must be a boolean`);
    }

    return {
      id: id.trim(),
      name: name.trim(),
      model: model.trim(),
      systemPrompt: systemPrompt.trim(),
      enabled,
    };
  });
}

function defaultSubAgentsForType(strategyType: StrategyType): SubAgentConfigItem[] {
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

  const map = {} as PoolAllocations;
  for (const row of rows) {
    if (isPoolId(row.poolId)) {
      map[row.poolId] = row.amount;
    }
  }

  return Object.keys(map).length > 0 ? map : { ...DEFAULT_POOL_ALLOCATIONS };
}

function toResponse(
  strategy: NonNullable<Awaited<ReturnType<typeof repo.findStrategyByUserId>>>,
): AgentStrategyResponse {
  const strategyType = strategy.strategyType as StrategyType;
  return {
    id: strategy.id,
    strategyType,
    status: strategy.status as AgentStrategyResponse["status"],
    depositAmount: strategy.depositAmount,
    poolAllocations: poolAllocationsFromRows(strategy.poolAllocations),
    subAgents: subAgentsFromDb(strategyType, strategy.subAgentConfig),
    tradingEnabledAt: strategy.tradingEnabledAt?.toISOString() ?? null,
    lastCycleAt: strategy.lastCycleAt?.toISOString() ?? null,
    createdAt: strategy.createdAt.toISOString(),
    updatedAt: strategy.updatedAt.toISOString(),
  };
}

export async function getUserStrategy(userId: string): Promise<AgentStrategyResponse | null> {
  const strategy = await repo.findStrategyByUserId(userId);
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
  },
): Promise<AgentStrategyResponse> {
  const status = input.status ?? "draft";
  const depositAmount =
    input.depositAmount ?? (status === "active" ? DEFAULT_DEPOSIT_AMOUNT : 0);

  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    throw new StrategyError("VALIDATION_ERROR", "depositAmount must be a non-negative number");
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

  const existing = await repo.findStrategyByUserId(userId);
  const triggerFirstCycle = shouldTriggerCycleOnActivate(
    existing?.status,
    existing?.lastCycleAt,
    status,
    depositAmount,
  );

  const strategy = await repo.upsertStrategy(userId, {
    strategyType: input.strategyType,
    depositAmount,
    poolAllocations,
    status,
    subAgentConfig,
  });

  log.info("Agent strategy saved", {
    userId,
    strategyType: input.strategyType,
    depositAmount,
    status,
    triggerFirstCycle,
  });

  if (triggerFirstCycle) {
    scheduleTradingCycle(userId, "activation");
  }

  return toResponse(strategy);
}

export async function patchPoolAllocations(
  userId: string,
  poolAllocations: PoolAllocations,
): Promise<AgentStrategyResponse> {
  const strategy = await repo.updatePoolAllocations(userId, poolAllocations);
  if (!strategy) {
    throw new StrategyError("STRATEGY_NOT_FOUND", "No agent strategy found for user", 404);
  }

  log.info("Pool allocations updated", { userId });

  return toResponse(strategy);
}

export async function patchSubAgents(
  userId: string,
  subAgents: SubAgentConfigItem[],
): Promise<AgentStrategyResponse> {
  const enabledCount = subAgents.filter((agent) => agent.enabled).length;
  if (enabledCount === 0) {
    throw new StrategyError("VALIDATION_ERROR", "At least one sub-agent must be enabled");
  }

  const strategy = await repo.updateSubAgentConfig(userId, subAgents);
  if (!strategy) {
    throw new StrategyError("STRATEGY_NOT_FOUND", "No agent strategy found for user", 404);
  }

  log.info("Sub-agent config updated", { userId, count: subAgents.length });

  return toResponse(strategy);
}
