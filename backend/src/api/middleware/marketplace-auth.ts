import type { NextFunction, Request, Response } from "express";
import { fail } from "../../utils/http-response.js";
import { requireAuth } from "./auth.js";

/**
 * Session cookie auth, or internal service headers for in-process x402 buyer:
 * `X-Marketplace-Internal-Secret` + `X-Marketplace-User-Id`.
 */
export function requireMarketplaceAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.MARKETPLACE_INTERNAL_SECRET?.trim();
  const headerSecret = req.header("X-Marketplace-Internal-Secret")?.trim();
  const userId = req.header("X-Marketplace-User-Id")?.trim();

  if (secret && headerSecret === secret && userId) {
    req.user = { id: userId, email: "marketplace-internal@arcane" };
    next();
    return;
  }

  if (headerSecret || userId) {
    fail(req, res, 401, {
      code: "UNAUTHORIZED",
      message: "Invalid marketplace internal credentials",
    });
    return;
  }

  requireAuth(req, res, next);
}
