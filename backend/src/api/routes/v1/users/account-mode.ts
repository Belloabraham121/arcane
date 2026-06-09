import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { UserAccountError, setUserAccountMode } from "../../../../services/auth/user-account.service";
import { fail, ok } from "../../../../utils/http-response";

const bodySchema = z.object({
  accountMode: z.enum(["demo", "live"]),
  /** Required when switching demo → live. */
  confirmLiveWallet: z.boolean().optional(),
});

export const userAccountModeRouter = Router();

userAccountModeRouter.patch(
  "/api/v1/users/account-mode",
  requireAuth,
  async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid account mode payload",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await setUserAccountMode(
        req.user.id,
        parsed.data.accountMode,
        { confirmLiveWallet: parsed.data.confirmLiveWallet },
      );
      return ok(req, res, {
        user: result.user,
        warning: result.warning ?? null,
      });
    } catch (err) {
      if (err instanceof UserAccountError) {
        return fail(req, res, err.status, {
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  },
);
