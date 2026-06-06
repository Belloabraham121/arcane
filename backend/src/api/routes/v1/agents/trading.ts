import { Router } from "express";
import { requireAuth } from "../../../middleware/auth";
import {
  TradingError,
  getTradingStatusForUser,
  runTradingCycle,
} from "../../../../services/agents/trading-runner.service";
import { fail, ok } from "../../../../utils/http-response";

export const agentTradingRouter = Router();

agentTradingRouter.get("/api/v1/agents/trading/status", requireAuth, async (req, res) => {
  try {
    const status = await getTradingStatusForUser(req.user.id);
    return ok(req, res, { status });
  } catch (err) {
    if (err instanceof TradingError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});

agentTradingRouter.post("/api/v1/agents/trading/run-cycle", requireAuth, async (req, res) => {
  try {
    const summary = await runTradingCycle(req.user.id, "manual");
    return ok(req, res, { cycle: summary }, 202);
  } catch (err) {
    if (err instanceof TradingError) {
      return fail(req, res, err.status, { code: err.code, message: err.message });
    }
    throw err;
  }
});
