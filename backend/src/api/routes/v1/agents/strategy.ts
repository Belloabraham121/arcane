import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  StrategyError,
  getUserStrategy,
  parseProtocolAllocations,
  parseSubAgents,
  patchProtocolAllocations,
  patchSubAgents,
  upsertUserStrategy,
} from "../../../../services/agents/strategy.service";
import { fail, ok } from "../../../../utils/http-response";

const upsertSchema = z.object({
  strategyType: z.enum(["auto", "custom"]),
  status: z.enum(["draft", "active"]).optional(),
  depositAmount: z.number().nonnegative().optional(),
  protocolAllocations: z.record(z.number().nonnegative()).optional(),
  subAgents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      model: z.string().min(1),
      systemPrompt: z.string().min(1),
      enabled: z.boolean(),
    }),
  ).optional(),
});

const patchAllocationsSchema = z.object({
  protocolAllocations: z.record(z.number().nonnegative()),
});

const patchSubAgentsSchema = z.object({
  subAgents: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      model: z.string().min(1),
      systemPrompt: z.string().min(1),
      enabled: z.boolean(),
    }),
  ),
});

export const agentStrategyRouter = Router();

agentStrategyRouter.get("/api/v1/agents/strategy", requireAuth, async (req, res) => {
  try {
    const strategy = await getUserStrategy(req.user.id);
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
    const allocations = parsed.data.protocolAllocations
      ? parseProtocolAllocations(parsed.data.protocolAllocations)
      : undefined;
    const subAgents = parsed.data.subAgents
      ? parseSubAgents(parsed.data.subAgents)
      : undefined;

    const strategy = await upsertUserStrategy(req.user.id, {
      strategyType: parsed.data.strategyType,
      status: parsed.data.status,
      depositAmount: parsed.data.depositAmount,
      protocolAllocations: allocations,
      subAgents,
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
  "/api/v1/agents/strategy/protocol-allocations",
  requireAuth,
  async (req, res) => {
    const parsed = patchAllocationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid protocol allocation payload",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const allocations = parseProtocolAllocations(parsed.data.protocolAllocations);
      if (!allocations) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "protocolAllocations required",
        });
      }

      const strategy = await patchProtocolAllocations(req.user.id, allocations);
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
