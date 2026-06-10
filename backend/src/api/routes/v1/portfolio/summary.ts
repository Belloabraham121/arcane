import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  getPortfolioSummary,
  PortfolioDemoDisabledError,
  PortfolioStrategyRequiredError,
} from "../../../../services/portfolio/metrics.service";
import { AnvilForkUnhealthyError } from "../../../../services/dev/anvil-fork.service";
import { fail, ok } from "../../../../utils/http-response";

const querySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
});

export const portfolioSummaryRouter = Router();

portfolioSummaryRouter.get(
  "/api/v1/portfolio/summary",
  requireAuth,
  async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid portfolio summary query",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const summary = await getPortfolioSummary(
        req.user.id,
        parsed.data.mode,
      );
      return ok(req, res, summary);
    } catch (err) {
      if (err instanceof PortfolioStrategyRequiredError) {
        return fail(req, res, 404, {
          code: "STRATEGY_NOT_FOUND",
          message: err.message,
        });
      }
      if (err instanceof PortfolioDemoDisabledError) {
        return fail(req, res, 503, {
          code: "DEMO_DISABLED",
          message: err.message,
        });
      }
      if (err instanceof AnvilForkUnhealthyError) {
        return fail(req, res, 503, {
          code: "ANVIL_UNHEALTHY",
          message: err.message,
        });
      }
      throw err;
    }
  },
);
