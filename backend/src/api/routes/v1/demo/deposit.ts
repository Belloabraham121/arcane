import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import {
  DEMO_DEPOSIT_SYMBOLS,
} from "../../../../services/dev/anvil-fork.service";
import {
  DemoDepositError,
  depositToDemoWallet,
} from "../../../../services/demo/demo-deposit.service";
import { fail, ok } from "../../../../utils/http-response";

const bodySchema = z.object({
  symbol: z.enum(DEMO_DEPOSIT_SYMBOLS),
  amount: z.string().min(1),
});

export const demoDepositRouter = Router();

demoDepositRouter.post("/api/v1/demo/deposit", requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid demo deposit body",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await depositToDemoWallet(
      req.user.id,
      parsed.data.symbol,
      parsed.data.amount,
    );
    return ok(req, res, result, 201);
  } catch (err) {
    if (err instanceof DemoDepositError) {
      return fail(req, res, err.status, {
        code: err.code,
        message: err.message,
      });
    }
    throw err;
  }
});
