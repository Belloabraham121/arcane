import { Router } from "express";
import { z } from "zod";
import type { MarketplaceProductId } from "../../../../config/marketplace.js";
import { requireAuth } from "../../../middleware/auth.js";
import { buildMarketplaceCatalog } from "../../../../services/marketplace/catalog.js";
import {
  MarketplaceContextError,
  loadMarketplaceUserContext,
} from "../../../../services/marketplace/marketplace-context.service.js";
import { buildMarketplaceProduct } from "../../../../services/marketplace/products.js";
import { recordMarketplacePurchase } from "../../../../services/marketplace/purchase.repository.js";
import { createSttPaywallMiddleware } from "../../../../services/marketplace/stt-paywall.js";
import { fail, ok } from "../../../../utils/http-response.js";

const accountModeQuerySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

function handleMarketplaceError(
  req: Parameters<typeof fail>[0],
  res: Parameters<typeof fail>[1],
  err: unknown,
): ReturnType<typeof fail> | null {
  if (err instanceof MarketplaceContextError) {
    return fail(req, res, err.status, {
      code: err.code,
      message: err.message,
    });
  }
  return null;
}

async function deliverProduct(
  req: Parameters<typeof ok>[0],
  res: Parameters<typeof ok>[1],
  productId: MarketplaceProductId,
): Promise<ReturnType<typeof ok> | ReturnType<typeof fail>> {
  const parsed = accountModeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid marketplace query parameters",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const context = await loadMarketplaceUserContext(
      req.user.id,
      parsed.data.mode,
    );
    const data = buildMarketplaceProduct(productId, context);

    if (req.marketplacePayment) {
      await recordMarketplacePurchase({
        userId: req.user.id,
        payment: req.marketplacePayment,
        correlationId: req.correlationId,
      });
    }

    return ok(req, res, {
      productId,
      payment: req.marketplacePayment
        ? {
            amountSttWei: req.marketplacePayment.amountSttWei.toString(),
            payerAddress: req.marketplacePayment.payerAddress,
            txHash: req.marketplacePayment.txHash,
            devBypass: req.marketplacePayment.devBypass,
          }
        : null,
      ...data,
    });
  } catch (err) {
    const handled = handleMarketplaceError(req, res, err);
    if (handled) {
      return handled;
    }
    throw err;
  }
}

export const marketplaceRouter = Router();

marketplaceRouter.get("/api/v1/marketplace/catalog", requireAuth, (_req, res) => {
  return ok(_req, res, buildMarketplaceCatalog());
});

marketplaceRouter.get(
  "/api/v1/marketplace/pools/snapshot",
  requireAuth,
  createSttPaywallMiddleware("pools/snapshot"),
  async (req, res) => deliverProduct(req, res, "pools/snapshot"),
);

marketplaceRouter.get(
  "/api/v1/marketplace/signals/spread",
  requireAuth,
  createSttPaywallMiddleware("signals/spread"),
  async (req, res) => deliverProduct(req, res, "signals/spread"),
);

marketplaceRouter.get(
  "/api/v1/marketplace/signals/cross-chain",
  requireAuth,
  createSttPaywallMiddleware("signals/cross-chain"),
  async (req, res) => deliverProduct(req, res, "signals/cross-chain"),
);
