import type { AccountMode, Prisma } from "@prisma/client";
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

export async function findStrategyByUserId(
  userId: string,
  accountMode: AccountMode,
) {
  return prisma.agentStrategy.findUnique({
    where: {
      userId_accountMode: { userId, accountMode },
    },
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
  accountMode: AccountMode,
  input: {
    strategyType: StrategyType;
    status?: StrategyStatus;
    depositAmount: number;
    poolAllocations: PoolAllocations;
    subAgentConfig?: SubAgentConfigItem[];
    cycleIntervalMinutes?: number | null;
    subAgentX402BudgetSttWei?: bigint | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentStrategy.findUnique({
      where: { userId_accountMode: { userId, accountMode } },
    });

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
      where: { userId_accountMode: { userId, accountMode } },
      create: {
        userId,
        accountMode,
        strategyType: input.strategyType,
        status: input.status ?? "draft",
        depositAmount: input.depositAmount,
        tradingEnabledAt,
        cycleIntervalMinutes,
        subAgentConfig: input.subAgentConfig as Prisma.InputJsonValue | undefined,
        subAgentX402BudgetSttWei: input.subAgentX402BudgetSttWei ?? null,
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
        ...(input.subAgentX402BudgetSttWei !== undefined
          ? { subAgentX402BudgetSttWei: input.subAgentX402BudgetSttWei }
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
  accountMode: AccountMode,
  poolAllocations: PoolAllocations,
) {
  const existing = await findStrategyByUserId(userId, accountMode);
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

export async function updateSubAgentConfig(
  userId: string,
  accountMode: AccountMode,
  subAgentConfig: SubAgentConfigItem[],
) {
  const existing = await findStrategyByUserId(userId, accountMode);
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

export async function updateStrategyStatus(
  userId: string,
  accountMode: AccountMode,
  status: StrategyStatus,
) {
  const existing = await findStrategyByUserId(userId, accountMode);
  if (!existing) {
    return null;
  }

  return prisma.agentStrategy.update({
    where: { id: existing.id },
    data: { status },
    include: strategyInclude,
  });
}
