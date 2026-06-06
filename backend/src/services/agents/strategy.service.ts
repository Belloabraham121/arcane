import { createLogger } from "../../shared/logger";
import * as repo from "./strategy.repository";
import {
  DEFAULT_AUTO_SUB_AGENTS,
  DEFAULT_CUSTOM_SUB_AGENTS,
  DEFAULT_DEPOSIT_AMOUNT,
  DEFAULT_PROTOCOL_ALLOCATIONS,
  PROTOCOL_IDS,
  type AgentStrategyResponse,
  type ProtocolAllocations,
  type ProtocolId,
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

function isProtocolId(value: string): value is ProtocolId {
  return (PROTOCOL_IDS as readonly string[]).includes(value);
}

export function parseProtocolAllocations(
  input: unknown,
): ProtocolAllocations | undefined {
  if (input == null) {
    return undefined;
  }
  if (typeof input !== "object") {
    throw new StrategyError("VALIDATION_ERROR", "protocolAllocations must be an object");
  }

  const result = {} as ProtocolAllocations;
  for (const id of PROTOCOL_IDS) {
    const value = (input as Record<string, unknown>)[id];
    if (value === undefined) {
      throw new StrategyError("VALIDATION_ERROR", `Missing allocation for ${id}`);
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        `Invalid allocation for ${id}: must be a non-negative number`,
      );
    }
    result[id] = value;
  }

  for (const key of Object.keys(input as object)) {
    if (!isProtocolId(key)) {
      throw new StrategyError("VALIDATION_ERROR", `Unknown protocol: ${key}`);
    }
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

function allocationsFromDb(
  rows: { protocol: string; amount: number }[],
): ProtocolAllocations {
  const map = { ...DEFAULT_PROTOCOL_ALLOCATIONS };
  for (const row of rows) {
    if (isProtocolId(row.protocol)) {
      map[row.protocol] = row.amount;
    }
  }
  return map;
}

function toResponse(
  strategy: Awaited<ReturnType<typeof repo.findStrategyByUserId>> & {
    protocolAllocations: { protocol: string; amount: number }[];
    subAgentConfig?: unknown;
  },
): AgentStrategyResponse {
  const strategyType = strategy!.strategyType as StrategyType;
  return {
    id: strategy!.id,
    strategyType,
    status: strategy!.status as AgentStrategyResponse["status"],
    depositAmount: strategy!.depositAmount,
    protocolAllocations: allocationsFromDb(strategy!.protocolAllocations),
    subAgents: subAgentsFromDb(strategyType, strategy!.subAgentConfig),
    createdAt: strategy!.createdAt.toISOString(),
    updatedAt: strategy!.updatedAt.toISOString(),
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
    protocolAllocations?: ProtocolAllocations;
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

  let protocolAllocations: ProtocolAllocations;
  if (input.strategyType === "auto") {
    protocolAllocations = input.protocolAllocations ?? { ...DEFAULT_PROTOCOL_ALLOCATIONS };
  } else {
    if (!input.protocolAllocations) {
      throw new StrategyError(
        "VALIDATION_ERROR",
        "protocolAllocations required for custom strategy",
      );
    }
    protocolAllocations = input.protocolAllocations;
  }

  const subAgentConfig =
    input.subAgents ??
    (input.strategyType === "auto"
      ? DEFAULT_AUTO_SUB_AGENTS
      : DEFAULT_CUSTOM_SUB_AGENTS);

  const strategy = await repo.upsertStrategy(userId, {
    strategyType: input.strategyType,
    depositAmount,
    protocolAllocations,
    status,
    subAgentConfig,
  });

  log.info("Agent strategy saved", {
    userId,
    strategyType: input.strategyType,
    depositAmount,
  });

  return toResponse(strategy);
}

export async function patchProtocolAllocations(
  userId: string,
  protocolAllocations: ProtocolAllocations,
): Promise<AgentStrategyResponse> {
  const strategy = await repo.updateProtocolAllocations(userId, protocolAllocations);
  if (!strategy) {
    throw new StrategyError("STRATEGY_NOT_FOUND", "No agent strategy found for user", 404);
  }

  log.info("Protocol allocations updated", { userId });

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
