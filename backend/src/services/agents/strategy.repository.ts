import type { Prisma } from "@prisma/client";
import type {
  PoolAllocations,
  ProtocolId,
  StrategyStatus,
  StrategyType,
  SubAgentConfigItem,
} from "./strategy.types";
import { prisma } from "../../infrastructure/postgres/client";

type AllocationInput = Record<ProtocolId, number>;

export async function findStrategyByUserId(userId: string) {
  return prisma.agentStrategy.findUnique({
    where: { userId },
    include: { protocolAllocations: true },
  });
}

export async function upsertStrategy(
  userId: string,
  input: {
    strategyType: StrategyType;
    status?: StrategyStatus;
    depositAmount: number;
    protocolAllocations: AllocationInput;
    poolAllocations: PoolAllocations;
    subAgentConfig?: SubAgentConfigItem[];
  },
) {
  return prisma.$transaction(async (tx) => {
    const poolJson = input.poolAllocations as Prisma.InputJsonValue;
    const strategy = await tx.agentStrategy.upsert({
      where: { userId },
      create: {
        userId,
        strategyType: input.strategyType,
        status: input.status ?? "draft",
        depositAmount: input.depositAmount,
        poolAllocations: poolJson,
        subAgentConfig: input.subAgentConfig as Prisma.InputJsonValue | undefined,
      },
      update: {
        strategyType: input.strategyType,
        status: input.status ?? "draft",
        depositAmount: input.depositAmount,
        poolAllocations: poolJson,
        ...(input.subAgentConfig !== undefined
          ? { subAgentConfig: input.subAgentConfig as Prisma.InputJsonValue }
          : {}),
      },
    });

    for (const protocol of Object.keys(input.protocolAllocations) as ProtocolId[]) {
      await tx.protocolAllocation.upsert({
        where: {
          strategyId_protocol: {
            strategyId: strategy.id,
            protocol,
          },
        },
        create: {
          strategyId: strategy.id,
          protocol,
          amount: input.protocolAllocations[protocol],
        },
        update: {
          amount: input.protocolAllocations[protocol],
        },
      });
    }

    return tx.agentStrategy.findUniqueOrThrow({
      where: { id: strategy.id },
      include: { protocolAllocations: true },
    });
  });
}

export async function updateProtocolAllocations(
  userId: string,
  protocolAllocations: AllocationInput,
) {
  const existing = await findStrategyByUserId(userId);
  if (!existing) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    for (const protocol of Object.keys(protocolAllocations) as ProtocolId[]) {
      await tx.protocolAllocation.upsert({
        where: {
          strategyId_protocol: {
            strategyId: existing.id,
            protocol,
          },
        },
        create: {
          strategyId: existing.id,
          protocol,
          amount: protocolAllocations[protocol],
        },
        update: {
          amount: protocolAllocations[protocol],
        },
      });
    }

    await tx.agentStrategy.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });

    return tx.agentStrategy.findUniqueOrThrow({
      where: { id: existing.id },
      include: { protocolAllocations: true },
    });
  });
}

export async function updatePoolAllocations(userId: string, poolAllocations: PoolAllocations) {
  const existing = await findStrategyByUserId(userId);
  if (!existing) {
    return null;
  }

  return prisma.agentStrategy.update({
    where: { id: existing.id },
    data: { poolAllocations: poolAllocations as Prisma.InputJsonValue },
    include: { protocolAllocations: true },
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
    include: { protocolAllocations: true },
  });
}
