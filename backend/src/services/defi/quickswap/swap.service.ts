import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import { ZERO_DEPLOYER } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { erc20MinimalAbi, swapRouterAbi } from "./abis";
import { QuickSwapNotDeployedError } from "./pool-registry";
import {
  emptyPluginDataForHops,
  encodeAlgebraSwapPath,
} from "./path-encoding";
import type { EncodedTxCall, SwapBuildResult } from "./types";

const DEFAULT_DEADLINE_SECONDS = 20 * 60;

export class SwapBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapBuildError";
  }
}

function assertQuickSwapDeployed(): void {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  if (!contractsDeployed) {
    throw new QuickSwapNotDeployedError(chainId);
  }
}

export function applySlippageMinimum(
  quotedAmountOut: bigint,
  slippageBps: number,
): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) {
    throw new SwapBuildError(`Invalid slippageBps: ${slippageBps}`);
  }
  return (quotedAmountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function defaultSwapDeadline(
  nowSeconds = Math.floor(Date.now() / 1000),
): bigint {
  return BigInt(nowSeconds + DEFAULT_DEADLINE_SECONDS);
}

function resolveAmountOutMinimum(
  slippageBps: number,
  options?: {
    quotedAmountOut?: bigint;
    amountOutMinimum?: bigint;
  },
): bigint {
  if (options?.amountOutMinimum !== undefined) {
    return options.amountOutMinimum;
  }
  if (options?.quotedAmountOut !== undefined) {
    return applySlippageMinimum(options.quotedAmountOut, slippageBps);
  }
  return 0n;
}

/**
 * ERC-20 approve calldata for the swap router (or any spender).
 */
export function buildApprove(
  token: Address,
  spender: Address,
  amount: bigint,
): EncodedTxCall {
  if (amount < 0n) {
    throw new SwapBuildError("approve amount must be non-negative");
  }

  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20MinimalAbi,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}

export type BuildSwapOptions = {
  quotedAmountOut?: bigint;
  amountOutMinimum?: bigint;
  deadline?: bigint;
  deployer?: Address;
};

/**
 * Single-hop exact-input swap via SwapRouter.exactInputSingle.
 */
export function buildSwapExactIn(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  slippageBps: number,
  recipient: Address,
  options?: BuildSwapOptions,
): SwapBuildResult {
  assertQuickSwapDeployed();

  if (amountIn <= 0n) {
    throw new SwapBuildError("amountIn must be positive");
  }
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
    throw new SwapBuildError("tokenIn and tokenOut must differ");
  }

  const { contracts } = getQuickSwapEnv();
  const deployer = options?.deployer ?? ZERO_DEPLOYER;
  const deadline = options?.deadline ?? defaultSwapDeadline();
  const amountOutMinimum = resolveAmountOutMinimum(slippageBps, options);

  const data = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        pluginData: "0x",
        tokenIn,
        tokenOut,
        deployer,
        recipient,
        deadline,
        amountIn,
        amountOutMinimum,
        limitSqrtPrice: 0n,
      },
    ],
  });

  return {
    call: { to: contracts.swapRouter, data },
    router: contracts.swapRouter,
    amountIn,
    amountOutMinimum,
    quotedAmountOut: options?.quotedAmountOut,
    deadline,
    tokens: [tokenIn, tokenOut],
  };
}

/**
 * Multihop exact-input swap via SwapRouter.exactInput.
 * `path` is the ordered token list (e.g. USDCe → WSOMI → WETH).
 */
export function buildSwapRoute(
  path: readonly Address[],
  amountIn: bigint,
  slippageBps: number,
  recipient: Address,
  options?: BuildSwapOptions,
): SwapBuildResult {
  assertQuickSwapDeployed();

  if (path.length < 2) {
    throw new SwapBuildError("path must contain at least two tokens");
  }
  if (amountIn <= 0n) {
    throw new SwapBuildError("amountIn must be positive");
  }

  const { contracts } = getQuickSwapEnv();
  const deployer = options?.deployer ?? ZERO_DEPLOYER;
  const deadline = options?.deadline ?? defaultSwapDeadline();
  const amountOutMinimum = resolveAmountOutMinimum(slippageBps, options);
  const encodedPath = encodeAlgebraSwapPath(path, deployer);
  const hopCount = path.length - 1;

  const data = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInput",
    args: [
      {
        pluginData: [...emptyPluginDataForHops(hopCount)],
        path: encodedPath,
        recipient,
        deadline,
        amountIn,
        amountOutMinimum,
      },
    ],
  });

  return {
    call: { to: contracts.swapRouter, data },
    router: contracts.swapRouter,
    amountIn,
    amountOutMinimum,
    quotedAmountOut: options?.quotedAmountOut,
    deadline,
    path: encodedPath,
    tokens: path,
  };
}
