import { Router } from "express";
import { z } from "zod";
import type { MarketplaceProductId } from "../../../../config/marketplace.js";
import { requireMarketplaceAuth } from "../../../middleware/marketplace-auth.js";
import { buildMarketplaceCatalog } from "../../../../services/marketplace/catalog.js";
import {
  MarketplaceContextError,
  loadMarketplaceUserContext,
} from "../../../../services/marketplace/marketplace-context.service.js";
import { deliverMarketplaceProductForUser } from "../../../../services/marketplace/marketplace-delivery.service.js";
import { listRecentMarketplacePurchases } from "../../../../services/marketplace/purchase.repository.js";
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

  if (!req.marketplacePayment) {
    return fail(req, res, 500, {
      code: "PAYMENT_MISSING",
      message: "Marketplace paywall did not attach payment context",
    });
  }

  try {
    const delivered = await deliverMarketplaceProductForUser({
      userId: req.user.id,
      productId,
      accountMode: parsed.data.mode,
      payment: req.marketplacePayment,
      correlationId: req.correlationId,
    });

    return ok(req, res, {
      productId,
      payment: delivered.payment,
      ...delivered.data,
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

marketplaceRouter.get(
  "/api/v1/marketplace/catalog",
  requireMarketplaceAuth,
  (_req, res) => {
    return ok(_req, res, buildMarketplaceCatalog());
  },
);

marketplaceRouter.get(
  "/api/v1/marketplace/purchases",
  requireMarketplaceAuth,
  async (req, res) => {
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
      : 50;
    const purchases = await listRecentMarketplacePurchases(req.user.id, limit);
    return ok(req, res, { purchases });
  },
);

marketplaceRouter.get(
  "/api/v1/marketplace/pools/snapshot",
  requireMarketplaceAuth,
  createSttPaywallMiddleware("pools/snapshot"),
  async (req, res) => deliverProduct(req, res, "pools/snapshot"),
);

marketplaceRouter.get(
  "/api/v1/marketplace/signals/spread",
  requireMarketplaceAuth,
  createSttPaywallMiddleware("signals/spread"),
  async (req, res) => deliverProduct(req, res, "signals/spread"),
);

marketplaceRouter.get(
  "/api/v1/marketplace/signals/cross-chain",
  requireMarketplaceAuth,
  createSttPaywallMiddleware("signals/cross-chain"),
  async (req, res) => deliverProduct(req, res, "signals/cross-chain"),
);
