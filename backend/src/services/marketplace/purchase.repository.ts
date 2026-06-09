import type { MarketplacePurchaseStatus } from "@prisma/client";
import type { MarketplaceProductId } from "../../config/marketplace.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import type { MarketplaceSttPayment } from "./stt-paywall.js";

export type MarketplacePurchaseReceiptContext = {
  cycleId?: string | null;
  subAgentId?: string | null;
  subAgentName?: string | null;
  status?: MarketplacePurchaseStatus;
  metadata?: Record<string, unknown> | null;
};

export async function recordMarketplacePurchase(input: {
  userId: string;
  payment: MarketplaceSttPayment;
  correlationId: string;
  context?: MarketplacePurchaseReceiptContext;
}): Promise<void> {
  const ctx = input.context;
  const metadata = ctx?.metadata
    ? ({
        ...ctx.metadata,
        ...(ctx.subAgentName ? { subAgentName: ctx.subAgentName } : {}),
      } as Record<string, unknown>)
    : ctx?.subAgentName
      ? { subAgentName: ctx.subAgentName }
      : undefined;

  await prisma.marketplacePurchase.create({
    data: {
      userId: input.userId,
      productId: input.payment.productId,
      amountSttWei: input.payment.amountSttWei,
      txHash: input.payment.txHash,
      payerAddress: input.payment.payerAddress,
      correlationId: input.correlationId,
      cycleId: ctx?.cycleId ?? null,
      subAgentId: ctx?.subAgentId ?? null,
      status: ctx?.status ?? "success",
      metadata: metadata ?? undefined,
    },
  });
}

/** Attach cycle/sub-agent context to a receipt created by the seller delivery path. */
export async function enrichMarketplacePurchaseReceipt(input: {
  userId: string;
  correlationId: string;
  productId: MarketplaceProductId;
  cycleId: string;
  subAgentId: string;
  subAgentName?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const existing = await prisma.marketplacePurchase.findFirst({
    where: {
      userId: input.userId,
      correlationId: input.correlationId,
      productId: input.productId,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    return;
  }

  const mergedMetadata =
    input.metadata || input.subAgentName
      ? {
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          ...(input.metadata ?? {}),
          ...(input.subAgentName ? { subAgentName: input.subAgentName } : {}),
        }
      : undefined;

  await prisma.marketplacePurchase.update({
    where: { id: existing.id },
    data: {
      cycleId: input.cycleId,
      subAgentId: input.subAgentId,
      ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
    },
  });
}

export async function recordMarketplacePurchaseFailure(input: {
  userId: string;
  productId: MarketplaceProductId;
  amountSttWei: bigint;
  payerAddress: string;
  correlationId: string;
  cycleId: string;
  subAgentId: string;
  subAgentName?: string;
  error: string;
}): Promise<void> {
  await prisma.marketplacePurchase.create({
    data: {
      userId: input.userId,
      productId: input.productId,
      amountSttWei: input.amountSttWei,
      txHash: null,
      payerAddress: input.payerAddress,
      correlationId: input.correlationId,
      cycleId: input.cycleId,
      subAgentId: input.subAgentId,
      status: "failed",
      metadata: {
        error: input.error,
        ...(input.subAgentName ? { subAgentName: input.subAgentName } : {}),
      },
    },
  });
}

export async function sumMarketplaceSpendSttWei(
  userId: string,
  since?: Date,
): Promise<bigint> {
  const rows = await prisma.marketplacePurchase.aggregate({
    where: {
      userId,
      status: "success",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _sum: { amountSttWei: true },
  });
  return rows._sum.amountSttWei ?? 0n;
}

export async function listRecentMarketplacePurchases(
  userId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    cycleId: string | null;
    subAgentId: string | null;
    productId: MarketplaceProductId;
    amountSttWei: string;
    txHash: string | null;
    payerAddress: string;
    correlationId: string;
    status: MarketplacePurchaseStatus;
    metadata: unknown;
    createdAt: string;
  }>
> {
  const rows = await prisma.marketplacePurchase.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    cycleId: row.cycleId,
    subAgentId: row.subAgentId,
    productId: row.productId as MarketplaceProductId,
    amountSttWei: row.amountSttWei.toString(),
    txHash: row.txHash,
    payerAddress: row.payerAddress,
    correlationId: row.correlationId,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listMarketplacePurchasesForCycle(
  cycleId: string,
): Promise<
  Array<{
    id: string;
    subAgentId: string | null;
    productId: string;
    amountSttWei: string;
    txHash: string | null;
    status: MarketplacePurchaseStatus;
    metadata: unknown;
    createdAt: string;
  }>
> {
  const rows = await prisma.marketplacePurchase.findMany({
    where: { cycleId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    subAgentId: row.subAgentId,
    productId: row.productId,
    amountSttWei: row.amountSttWei.toString(),
    txHash: row.txHash,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}
