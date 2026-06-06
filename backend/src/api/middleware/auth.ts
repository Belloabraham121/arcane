import type { NextFunction, Request, Response } from "express";
import { getAuthEnv } from "../../config/env";
import { fail } from "../../utils/http-response";
import { verifySession } from "../../utils/session";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { cookieName } = getAuthEnv();
  const token = req.cookies?.[cookieName];

  if (typeof token !== "string" || token.length === 0) {
    fail(req, res, 401, {
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
    return;
  }

  try {
    const payload = verifySession(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    fail(req, res, 401, {
      code: "UNAUTHORIZED",
      message: "Invalid or expired session",
    });
  }
}
