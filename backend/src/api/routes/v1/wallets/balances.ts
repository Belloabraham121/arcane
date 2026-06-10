import { Router } from "express";
import { isAddress } from "viem";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth";
import { findUserById } from "../../../../services/auth/user.repository";
import { getDemoEnv } from "../../../../config/env";
import { QuickSwapNotDeployedError } from "../../../../services/defi/quickswap/pool-registry";
import {
  AnvilForkUnhealthyError,
  assertAnvilForkHealthy,
} from "../../../../services/dev/anvil-fork.service";
import {
  resolvePortfolioWallet,
  withPortfolioRpc,
} from "../../../../services/portfolio/wallet-context.service";
import { getWalletBalances } from "../../../../services/wallet/token-balance.service";
import { fail, ok } from "../../../../utils/http-response";

const querySchema = z.object({
  mode: z.enum(["demo", "live"]).optional(),
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

  const accountMode = parsed.data.mode ?? user.accountMode;
  const resolved = resolvePortfolioWallet(
    accountMode,
    user.walletAddress as `0x${string}`,
  );

  if (resolved.rpcMode === "fork") {
    const demoEnv = getDemoEnv();
    if (!demoEnv.tradingEnabled) {
      return fail(req, res, 503, {
        code: "DEMO_DISABLED",
        message: "Demo balance reads are disabled",
      });
    }
    try {
      await assertAnvilForkHealthy(demoEnv.anvilRpcUrl);
    } catch (err) {
      if (err instanceof AnvilForkUnhealthyError) {
        return fail(req, res, 503, {
          code: "ANVIL_UNHEALTHY",
          message: err.message,
        });
      }
      throw err;
    }
  }

  try {
    const result = await withPortfolioRpc(resolved.rpcMode, () =>
      getWalletBalances(resolved.walletAddress, parsed.data.poolIds),
    );
    return ok(req, res, {
      ...result,
      accountMode,
      chainLabel: resolved.chainLabel,
    });
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
