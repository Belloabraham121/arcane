import { Router } from "express";
import { isAddress } from "viem";
import { z } from "zod";
import { getQuickSwapEnv } from "../../../../config/env";
import {
  getEnrichedPool,
  listPoolsWithMetrics,
} from "../../../../services/defi/quickswap/pool-metrics.service";
import {
  QuickSwapNotDeployedError,
  getKnownPoolById,
} from "../../../../services/defi/quickswap/pool-registry";
import {
  QuoteNotAvailableError,
  quoteExactIn,
} from "../../../../services/defi/quickswap/quote.service";
import { fail, ok } from "../../../../utils/http-response";

const poolIdParamSchema = z.object({
  poolId: z.string().min(1),
});

const quoteQuerySchema = z.object({
  tokenIn: z
    .string()
    .refine((v) => isAddress(v), { message: "tokenIn must be a valid address" }),
  amountIn: z
    .string()
    .regex(/^\d+$/, { message: "amountIn must be a positive integer string" })
    .refine((v) => v !== "0", { message: "amountIn must be greater than zero" }),
});

function quickSwapChainMeta() {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  return { chainId, contractsDeployed };
}

function handleQuickSwapError(
  req: Parameters<typeof fail>[0],
  res: Parameters<typeof fail>[1],
  err: unknown,
): ReturnType<typeof fail> | null {
  if (err instanceof QuickSwapNotDeployedError) {
    return fail(req, res, 503, {
      code: "QUICKSWAP_NOT_DEPLOYED",
      message: err.message,
    });
  }
  if (err instanceof QuoteNotAvailableError) {
    return fail(req, res, 422, {
      code: "QUOTE_NOT_AVAILABLE",
      message: err.message,
    });
  }
  return null;
}

export const quickswapPoolsRouter = Router();

quickswapPoolsRouter.get("/api/v1/quickswap/pools", async (req, res) => {
  try {
    const pools = await listPoolsWithMetrics();
    return ok(req, res, {
      ...quickSwapChainMeta(),
      pools,
    });
  } catch (err) {
    const handled = handleQuickSwapError(req, res, err);
    if (handled) {
      return handled;
    }
    throw err;
  }
});

quickswapPoolsRouter.get("/api/v1/quickswap/pools/:poolId", async (req, res) => {
  const parsed = poolIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return fail(req, res, 400, {
      code: "VALIDATION_ERROR",
      message: "Invalid pool id",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const pool = await getEnrichedPool(parsed.data.poolId);
    if (!pool) {
      return fail(req, res, 404, {
        code: "POOL_NOT_FOUND",
        message: `No QuickSwap pool found for id: ${parsed.data.poolId}`,
      });
    }

    return ok(req, res, {
      ...quickSwapChainMeta(),
      pool,
    });
  } catch (err) {
    const handled = handleQuickSwapError(req, res, err);
    if (handled) {
      return handled;
    }
    throw err;
  }
});

quickswapPoolsRouter.get(
  "/api/v1/quickswap/pools/:poolId/quote",
  async (req, res) => {
    const paramsParsed = poolIdParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid pool id",
        details: paramsParsed.error.flatten().fieldErrors,
      });
    }

    const queryParsed = quoteQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid quote query parameters",
        details: queryParsed.error.flatten().fieldErrors,
      });
    }

    try {
      const pool = await getKnownPoolById(paramsParsed.data.poolId);
      if (!pool) {
        return fail(req, res, 404, {
          code: "POOL_NOT_FOUND",
          message: `No QuickSwap pool found for id: ${paramsParsed.data.poolId}`,
        });
      }

      const tokenIn = queryParsed.data.tokenIn as `0x${string}`;
      const amountIn = BigInt(queryParsed.data.amountIn);

      const token0 = pool.token0.address.toLowerCase();
      const token1 = pool.token1.address.toLowerCase();
      const inLower = tokenIn.toLowerCase();

      let tokenOut: `0x${string}`;
      if (inLower === token0) {
        tokenOut = pool.token1.address;
      } else if (inLower === token1) {
        tokenOut = pool.token0.address;
      } else {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "tokenIn must be one of the pool's tokens",
          details: {
            tokenIn: [tokenIn],
            allowed: [pool.token0.address, pool.token1.address],
          },
        });
      }

      const quote = await quoteExactIn(tokenIn, tokenOut, amountIn);

      return ok(req, res, {
        ...quickSwapChainMeta(),
        poolId: pool.id,
        quote,
      });
    } catch (err) {
      const handled = handleQuickSwapError(req, res, err);
      if (handled) {
        return handled;
      }
      throw err;
    }
  },
);
