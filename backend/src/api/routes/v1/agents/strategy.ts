import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  StrategyError,
  getUserStrategy,
  parsePoolAllocations,
  parseSubAgents,
  patchPoolAllocations,
  patchSubAgents,
  pauseUserStrategy,
  resumeUserStrategy,
  upsertUserStrategy,
} from "../../../../services/agents/strategy.service";
import { fail, ok } from "../../../../utils/http-response";

const upsertSchema = z.object({
  strategyType: z.enum(["auto", "custom"]),
  status: z.enum(["draft", "active"]).optional(),
  depositAmount: z.number().nonnegative().optional(),
  poolAllocations: z.record(z.number().nonnegative()).optional(),
  subAgents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      systemPrompt: z.string().min(1),
      enabled: z.boolean(),
      useMarketplaceData: z.boolean().optional(),
      limits: z
        .object({
          maxSwapPortfolioPercent: z.number().positive().max(100).optional(),
          maxSlippageBps: z.number().int().positive().max(10_000).optional(),
          driftThresholdPercent: z.number().positive().max(100).optional(),
          cycleCooldownMinutes: z.number().int().min(1).max(1440).optional(),
        })
        .optional(),
    }),
  ).optional(),
  cycleIntervalMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  subAgentX402BudgetSttWei: z
    .union([z.string().regex(/^\d+$/), z.null()])
    .optional(),
});

const patchPoolAllocationsSchema = z.object({
  poolAllocations: z.record(z.number().nonnegative()),
});

const patchSubAgentsSchema = z.object({
  subAgents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      systemPrompt: z.string().min(1),
      enabled: z.boolean(),
      useMarketplaceData: z.boolean().optional(),
      limits: z
        .object({
          maxSwapPortfolioPercent: z.number().positive().max(100).optional(),
          maxSlippageBps: z.number().int().positive().max(10_000).optional(),
          driftThresholdPercent: z.number().positive().max(100).optional(),
          cycleCooldownMinutes: z.number().int().min(1).max(1440).optional(),
        })
        .optional(),
    }),
  ),
});

const strategyQuerySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

export const agentStrategyRouter = Router();

agentStrategyRouter.get("/api/v1/agents/strategy", requireAuth, async (req, res) => {
  const parsedQuery = strategyQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid strategy query",
      details: parsedQuery.error.flatten().fieldErrors,
    });
  }

  try {
    const strategy = await getUserStrategy(
      req.user.id,
      parsedQuery.data.mode,
    );
    if (!strategy) {
      return fail(req, res, 404, {
        code: "STRATEGY_NOT_FOUND",
        message: "No agent strategy configured yet",
      });
    }
    return ok(req, res, { strategy });
  } catch (err) {
    if (err instanceof StrategyError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

agentStrategyRouter.put("/api/v1/agents/strategy", requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid strategy payload",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const poolAllocations = parsed.data.poolAllocations
      ? await parsePoolAllocations(parsed.data.poolAllocations)
      : undefined;
    const subAgents = parsed.data.subAgents
      ? parseSubAgents(parsed.data.subAgents)
      : undefined;

    const strategy = await upsertUserStrategy(req.user.id, {
      strategyType: parsed.data.strategyType,
      status: parsed.data.status,
      depositAmount: parsed.data.depositAmount,
      poolAllocations,
      subAgents,
      cycleIntervalMinutes: parsed.data.cycleIntervalMinutes,
      subAgentX402BudgetSttWei: parsed.data.subAgentX402BudgetSttWei,
    });

    return ok(req, res, { strategy });
  } catch (err) {
    if (err instanceof StrategyError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

agentStrategyRouter.patch(
  "/api/v1/agents/strategy/pool-allocations",
  requireAuth,
  async (req, res) => {
    const parsed = patchPoolAllocationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid pool allocation payload",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const poolAllocations = await parsePoolAllocations(parsed.data.poolAllocations);
      if (!poolAllocations) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "poolAllocations required",
        });
      }

      const strategy = await patchPoolAllocations(req.user.id, poolAllocations);
      return ok(req, res, { strategy });
    } catch (err) {
      if (err instanceof StrategyError) {
        return fail(req, res, err.status, { code: err.code, message: err.message });
      }
      throw err;
    }
  },
);

agentStrategyRouter.post(
  "/api/v1/agents/strategy/pause",
  requireAuth,
  async (req, res) => {
    const parsedQuery = strategyQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid strategy query",
        details: parsedQuery.error.flatten().fieldErrors,
      });
    }

    try {
      const strategy = await pauseUserStrategy(
        req.user.id,
        parsedQuery.data.mode,
      );
      return ok(req, res, { strategy });
    } catch (err) {
      if (err instanceof StrategyError) {
        return fail(req, res, err.status, { code: err.code, message: err.message });
      }
      throw err;
    }
  },
);

agentStrategyRouter.post(
  "/api/v1/agents/strategy/resume",
  requireAuth,
  async (req, res) => {
    const parsedQuery = strategyQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid strategy query",
        details: parsedQuery.error.flatten().fieldErrors,
      });
    }

    try {
      const strategy = await resumeUserStrategy(
        req.user.id,
        parsedQuery.data.mode,
      );
      return ok(req, res, { strategy });
    } catch (err) {
      if (err instanceof StrategyError) {
        return fail(req, res, err.status, { code: err.code, message: err.message });
      }
      throw err;
    }
  },
);

agentStrategyRouter.patch(
  "/api/v1/agents/strategy/sub-agents",
  requireAuth,
  async (req, res) => {
    const parsed = patchSubAgentsSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sub-agent payload",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const subAgents = parseSubAgents(parsed.data.subAgents);
      if (!subAgents) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "subAgents required",
        });
      }

      const strategy = await patchSubAgents(req.user.id, subAgents);
      return ok(req, res, { strategy });
    } catch (err) {
      if (err instanceof StrategyError) {
        return fail(req, res, err.status, { code: err.code, message: err.message });
      }
      throw err;
    }
  },
);
