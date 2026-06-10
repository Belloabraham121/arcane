import type { AccountMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  resolveAccountModeForCycle,
  runTradingCycle,
  TradingError,
} from "../../../../services/agents/trading-runner.service";
import { findUserById } from "../../../../services/auth/user.repository";
import { fail, ok } from "../../../../utils/http-response";

const cycleQuerySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

async function handleRunTradingCycle(
  userId: string,
  mode?: AccountMode,
): Promise<ReturnType<typeof runTradingCycle>> {
  if (mode) {
    const user = await findUserById(userId);
    if (!user) {
      throw new TradingError("USER_NOT_FOUND", "User not found", 404);
    }
    resolveAccountModeForCycle(user.accountMode, mode);
  }

  return runTradingCycle(userId, "manual", { accountMode: mode });
}

export const tradingCyclesRouter = Router();

/** Canonical trading cycle trigger (respects user account_mode). */
tradingCyclesRouter.post(
  "/api/v1/trading/cycles",
  requireAuth,
  async (req, res) => {
    const parsed = cycleQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid trading cycle query",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const summary = await handleRunTradingCycle(
        req.user.id,
        parsed.data.mode,
      );
      return ok(req, res, { cycle: summary }, 202);
    } catch (err) {
      if (err instanceof TradingError) {
        return fail(req, res, err.status, {
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  },
);
