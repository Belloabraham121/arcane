import type { Prisma } from "@prisma/client";
import type {
  PoolAllocations,
  StrategyStatus,
  StrategyType,
  SubAgentConfigItem,
} from "./strategy.types";
import { prisma } from "../../infrastructure/postgres/client";

const strategyInclude = {
  poolAllocations: true,
} as const;

export async function findStrategyByUserId(userId: string) {
  return prisma.agentStrategy.findUnique({
    where: { userId },
    include: strategyInclude,
  });
}

async function syncPoolAllocationRows(
  tx: Prisma.TransactionClient,
  strategyId: string,
  poolAllocations: PoolAllocations,
): Promise<void> {
  const poolIds = Object.keys(poolAllocations);

  for (const poolId of poolIds) {
    const amount = poolAllocations[poolId as keyof PoolAllocations];
    await tx.poolAllocation.upsert({
      where: {
        strategyId_poolId: {
          strategyId,
          poolId,
        },
      },
      create: {
        strategyId,
        poolId,
        amount,
      },
      update: {
        amount,
      },
    });
  }

  await tx.poolAllocation.deleteMany({
    where: {
      strategyId,
      poolId: { notIn: poolIds },
    },
  });
}

export async function upsertStrategy(
  userId: string,
  input: {
    strategyType: StrategyType;
    status?: StrategyStatus;
    depositAmount: number;
    poolAllocations: PoolAllocations;
    subAgentConfig?: SubAgentConfigItem[];
    cycleIntervalMinutes?: number | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentStrategy.findUnique({ where: { userId } });

    const activating = input.status === "active";
    const tradingEnabledAt =
      activating && !existing?.tradingEnabledAt
        ? new Date()
        : existing?.tradingEnabledAt ?? null;

    const cycleIntervalMinutes =
      input.cycleIntervalMinutes !== undefined
        ? input.cycleIntervalMinutes
        : existing?.cycleIntervalMinutes ?? null;

    const strategy = await tx.agentStrategy.upsert({
      where: { userId },
      create: {
        userId,
        strategyType: input.strategyType,
        status: input.status ?? "draft",
        depositAmount: input.depositAmount,
        tradingEnabledAt,
        cycleIntervalMinutes,
        subAgentConfig: input.subAgentConfig as Prisma.InputJsonValue | undefined,
      },
      update: {
        strategyType: input.strategyType,
        status: input.status ?? "draft",
        depositAmount: input.depositAmount,
        tradingEnabledAt,
        ...(input.cycleIntervalMinutes !== undefined
          ? { cycleIntervalMinutes: input.cycleIntervalMinutes }
          : {}),
        ...(input.subAgentConfig !== undefined
          ? { subAgentConfig: input.subAgentConfig as Prisma.InputJsonValue }
          : {}),
      },
    });

    await syncPoolAllocationRows(tx, strategy.id, input.poolAllocations);

    return tx.agentStrategy.findUniqueOrThrow({
      where: { id: strategy.id },
      include: strategyInclude,
    });
  });
}

export async function updatePoolAllocations(
  userId: string,
  poolAllocations: PoolAllocations,
) {
  const existing = await findStrategyByUserId(userId);
  if (!existing) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    await syncPoolAllocationRows(tx, existing.id, poolAllocations);

    await tx.agentStrategy.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });

    return tx.agentStrategy.findUniqueOrThrow({
      where: { id: existing.id },
      include: strategyInclude,
    });
  });
}

export async function updateSubAgentConfig(userId: string, subAgentConfig: SubAgentConfigItem[]) {
  const existing = await findStrategyByUserId(userId);
  if (!existing) {
    return null;
  }

  return prisma.agentStrategy.update({
    where: { id: existing.id },
    data: { subAgentConfig: subAgentConfig as Prisma.InputJsonValue },
    include: strategyInclude,
  });
}

export async function touchLastCycleAt(strategyId: string, at: Date = new Date()) {
  return prisma.agentStrategy.update({
    where: { id: strategyId },
    data: { lastCycleAt: at },
    include: strategyInclude,
  });
}
