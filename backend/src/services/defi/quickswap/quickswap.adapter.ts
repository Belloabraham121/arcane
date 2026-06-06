import type { Address } from "viem";
import { getQuickSwapEnv } from "../../../config/env";
import {
  getEnrichedPool,
  listPoolsWithMetrics,
  type EnrichedPoolView,
} from "./pool-metrics.service";
import { quoteExactIn, quoteExactInputPath } from "./quote.service";
import {
  buildApprove,
  buildSwapExactIn,
  buildSwapRoute,
  type BuildSwapOptions,
} from "./swap.service";
import type {
  EncodedTxCall,
  QuickSwapPool,
  SwapBuildResult,
  SwapQuote,
} from "./types";

/**
 * Facade over QuickSwap quote, swap calldata builders, and pool metrics.
 * Wallet submission lives in wallet-executor (Phase 3.4).
 */
export class QuickSwapAdapter {
  getRouterAddress(): Address {
    return getQuickSwapEnv().contracts.swapRouter;
  }

  getDefaultSlippageBps(): number {
    return getQuickSwapEnv().defaultSlippageBps;
  }

  quoteExactIn(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
  ): Promise<SwapQuote> {
    return quoteExactIn(tokenIn, tokenOut, amountIn);
  }

  quoteExactInputPath(
    tokens: readonly Address[],
    amountIn: bigint,
  ): Promise<SwapQuote> {
    return quoteExactInputPath(tokens, amountIn);
  }

  buildApprove(
    token: Address,
    spender: Address,
    amount: bigint,
  ): EncodedTxCall {
    return buildApprove(token, spender, amount);
  }

  buildSwapExactIn(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippageBps: number,
    recipient: Address,
    options?: BuildSwapOptions,
  ): SwapBuildResult {
    return buildSwapExactIn(
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
      recipient,
      options,
    );
  }

  buildSwapRoute(
    path: readonly Address[],
    amountIn: bigint,
    slippageBps: number,
    recipient: Address,
    options?: BuildSwapOptions,
  ): SwapBuildResult {
    return buildSwapRoute(path, amountIn, slippageBps, recipient, options);
  }

  async buildSwapExactInWithQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    recipient: Address,
    slippageBps?: number,
  ): Promise<{ quote: SwapQuote; swap: SwapBuildResult; approve?: EncodedTxCall }> {
    const bps = slippageBps ?? this.getDefaultSlippageBps();
    const quote = await this.quoteExactIn(tokenIn, tokenOut, amountIn);
    const quotedAmountOut = BigInt(quote.amountOut);
    const swap = this.buildSwapExactIn(
      tokenIn,
      tokenOut,
      amountIn,
      bps,
      recipient,
      { quotedAmountOut },
    );
    const approve = this.buildApprove(tokenIn, swap.router, amountIn);
    return { quote, swap, approve };
  }

  async buildSwapRouteWithQuote(
    path: readonly Address[],
    amountIn: bigint,
    recipient: Address,
    slippageBps?: number,
  ): Promise<{ quote: SwapQuote; swap: SwapBuildResult; approve?: EncodedTxCall }> {
    const bps = slippageBps ?? this.getDefaultSlippageBps();
    const quote = await this.quoteExactInputPath(path, amountIn);
    const quotedAmountOut = BigInt(quote.amountOut);
    const swap = this.buildSwapRoute(path, amountIn, bps, recipient, {
      quotedAmountOut,
    });
    const tokenIn = path[0]!;
    const approve = this.buildApprove(tokenIn, swap.router, amountIn);
    return { quote, swap, approve };
  }

  listPools(): Promise<QuickSwapPool[]> {
    return listPoolsWithMetrics();
  }

  getPool(poolId: string): Promise<EnrichedPoolView | null> {
    return getEnrichedPool(poolId);
  }
}

export const quickSwapAdapter = new QuickSwapAdapter();
