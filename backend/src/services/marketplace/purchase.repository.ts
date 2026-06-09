import type { MarketplaceProductId } from "../../config/marketplace.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import type { MarketplaceSttPayment } from "./stt-paywall.js";

export async function recordMarketplacePurchase(input: {
  userId: string;
  payment: MarketplaceSttPayment;
  correlationId: string;
}): Promise<void> {
  await prisma.marketplacePurchase.create({
    data: {
      userId: input.userId,
      productId: input.payment.productId,
      amountSttWei: input.payment.amountSttWei,
      txHash: input.payment.txHash,
      payerAddress: input.payment.payerAddress,
      correlationId: input.correlationId,
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
    productId: MarketplaceProductId;
    amountSttWei: string;
    txHash: string | null;
    payerAddress: string;
    correlationId: string;
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
    productId: row.productId as MarketplaceProductId,
    amountSttWei: row.amountSttWei.toString(),
    txHash: row.txHash,
    payerAddress: row.payerAddress,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
  }));
}
