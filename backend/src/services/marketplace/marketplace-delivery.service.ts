import type { AccountMode } from "@prisma/client";
import type { MarketplaceProductId } from "../../config/marketplace.js";
import { loadMarketplaceUserContext } from "./marketplace-context.service.js";
import { buildMarketplaceProduct } from "./products.js";
import {
  type MarketplacePurchaseReceiptContext,
  recordMarketplacePurchase,
} from "./purchase.repository.js";
import type { MarketplaceSttPayment } from "./stt-paywall.js";

export type MarketplaceDeliveryResult = {
  productId: MarketplaceProductId;
  data: Record<string, unknown>;
  payment: {
    amountSttWei: string;
    payerAddress: string;
    txHash: string | null;
    devBypass: boolean;
  };
};

export async function deliverMarketplaceProductForUser(input: {
  userId: string;
  productId: MarketplaceProductId;
  accountMode?: AccountMode;
  payment: MarketplaceSttPayment;
  correlationId: string;
  receiptContext?: MarketplacePurchaseReceiptContext;
}): Promise<MarketplaceDeliveryResult> {
  const context = await loadMarketplaceUserContext(
    input.userId,
    input.accountMode,
  );
  const product = buildMarketplaceProduct(input.productId, context);

  await recordMarketplacePurchase({
    userId: input.userId,
    payment: input.payment,
    correlationId: input.correlationId,
    context: {
      ...input.receiptContext,
      metadata: {
        ...(input.receiptContext?.metadata ?? {}),
        productData: product,
      },
    },
  });

  return {
    productId: input.productId,
    data: product as Record<string, unknown>,
    payment: {
      amountSttWei: input.payment.amountSttWei.toString(),
      payerAddress: input.payment.payerAddress,
      txHash: input.payment.txHash,
      devBypass: input.payment.devBypass,
    },
  };
}
