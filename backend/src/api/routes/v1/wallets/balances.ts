import { Router } from "express";
import { isAddress } from "viem";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { findUserById } from "../../../../services/auth/user.repository";
import { QuickSwapNotDeployedError } from "../../../../services/defi/quickswap/pool-registry";
import { getWalletBalances } from "../../../../services/wallet/token-balance.service";
import { fail, ok } from "../../../../utils/http-response";

const querySchema = z.object({
  poolIds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined,
    ),
});

export const walletBalancesRouter = Router();

walletBalancesRouter.get("/api/v1/wallets/balances", requireAuth, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid balances query",
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

  if (!isAddress(user.walletAddress)) {
    return fail(req, res, 500, {
      code: "INVALID_WALLET",
      message: "User wallet address is invalid",
    });
  }

  try {
    const result = await getWalletBalances(
      user.walletAddress as `0x${string}`,
      parsed.data.poolIds,
    );
    return ok(req, res, result);
  } catch (err) {
    if (err instanceof QuickSwapNotDeployedError) {
      return fail(req, res, 503, {
        code: "QUICKSWAP_NOT_DEPLOYED",
        message: err.message,
      });
    }
    throw err;
  }
});
