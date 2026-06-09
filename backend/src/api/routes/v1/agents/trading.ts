import type { AccountMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  resolveAccountModeForCycle,
  TradingError,
  getTradingStatusForUser,
  runTradingCycle,
} from "../../../../services/agents/trading-runner.service";
import {
  getTradingCycleDetail,
  listTradingCycles,
} from "../../../../services/agents/trading.repository";
import { findUserById } from "../../../../services/auth/user.repository";
import { fail, ok } from "../../../../utils/http-response";

const runCycleQuerySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

const modeQuerySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  mode: z.enum(["demo", "live"]).optional(),
});

export const agentTradingRouter = Router();

agentTradingRouter.get("/api/v1/agents/trading/status", requireAuth, async (req, res) => {
  const parsed = modeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid trading status query",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const status = await getTradingStatusForUser(req.user.id, parsed.data.mode);
    return ok(req, res, { status });
  } catch (err) {
    if (err instanceof TradingError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

agentTradingRouter.post("/api/v1/agents/trading/run-cycle", requireAuth, async (req, res) => {
  const parsed = runCycleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid run-cycle query",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const mode = parsed.data.mode;
    if (mode) {
      const user = await findUserById(req.user.id);
      if (!user) {
        return fail(req, res, 404, {
          code: "USER_NOT_FOUND",
          message: "User not found",
        });
      }
      resolveAccountModeForCycle(user.accountMode, mode as AccountMode);
    }

    const summary = await runTradingCycle(req.user.id, "manual", {
      accountMode: parsed.data.mode,
    });
    return ok(req, res, { cycle: summary }, 202);
  } catch (err) {
    if (err instanceof TradingError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

agentTradingRouter.get("/api/v1/agents/trading/history", requireAuth, async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid history query parameters",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    return fail(req, res, 404, {
      code: "USER_NOT_FOUND",
      message: "User not found",
    });
  }

  const { page, limit, mode } = parsed.data;
  const accountMode = mode ?? user.accountMode ?? undefined;
  const { items, total } = await listTradingCycles(
    req.user.id,
    page,
    limit,
    accountMode ?? undefined,
  );

  return res.status(200).json({
    success: true,
    data: { items },
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
    error: null,
  });
});

agentTradingRouter.get(
  "/api/v1/agents/trading/history/:id",
  requireAuth,
  async (req, res) => {
    const cycleId = req.params.id;
    if (!cycleId || typeof cycleId !== "string") {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Cycle id is required",
      });
    }

    const detail = await getTradingCycleDetail(req.user.id, cycleId);
    if (!detail) {
      return fail(req, res, 404, {
        code: "CYCLE_NOT_FOUND",
        message: "Trading cycle not found",
      });
    }

    return ok(req, res, { cycle: detail });
  },
);
