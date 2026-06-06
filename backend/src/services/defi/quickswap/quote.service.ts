import type { Address } from "viem";
import { encodeFunctionData, hexToBigInt, isHex } from "viem";
import { ZERO_DEPLOYER } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { quoterV2Abi, quoterV2QuoteAbi } from "./abis";
import { getQuickSwapPublicClient } from "./client";
import { QuickSwapNotDeployedError } from "./pool-registry";
import type { SwapQuote } from "./types";

export class QuoteNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteNotAvailableError";
  }
}

function assertQuickSwapDeployed(): void {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  if (!contractsDeployed) {
    throw new QuickSwapNotDeployedError(chainId);
  }
}

type QuoteTupleResult = readonly [
  bigint,
  bigint,
  bigint,
  number,
  bigint,
  number,
];

function mapQuoteResult(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  result: QuoteTupleResult,
): SwapQuote {
  const [amountOut, , sqrtPriceX96After, initializedTicksCrossed, gasEstimate, fee] =
    result;

  return {
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    sqrtPriceX96After: sqrtPriceX96After.toString(),
    initializedTicksCrossed,
    gasEstimate: gasEstimate.toString(),
    fee,
  };
}

/**
 * Raw eth_call fallback when simulateContract decoding fails on uint160 fields.
 * QuoterV2 returns data via revert on some chains; simulateContract is preferred.
 */
async function quoteViaRawCall(
  quoterAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<QuoteTupleResult> {
  const client = getQuickSwapPublicClient();
  const data = encodeFunctionData({
    abi: quoterV2QuoteAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        deployer: ZERO_DEPLOYER,
        amountIn,
        limitSqrtPrice: 0n,
      },
    ],
  });

  try {
    const { data: returnData } = await client.call({
      to: quoterAddress,
      data,
    });
    if (!returnData || returnData === "0x") {
      throw new QuoteNotAvailableError("Quoter returned empty data");
    }
    return decodeQuoteReturnData(returnData);
  } catch (err: unknown) {
    const revertData = extractRevertData(err);
    if (revertData) {
      return decodeQuoteReturnData(revertData);
    }
    throw err;
  }
}

function extractRevertData(err: unknown): `0x${string}` | null {
  if (!err || typeof err !== "object") {
    return null;
  }
  const record = err as Record<string, unknown>;
  const candidates = [record.data, record.raw, (record.cause as Record<string, unknown>)?.data];
  for (const value of candidates) {
    if (typeof value === "string" && isHex(value) && value.length > 10) {
      return value;
    }
  }
  return null;
}

/** Decode first 6 ABI words from quoter return/revert payload. */
function decodeQuoteReturnData(data: `0x${string}`): QuoteTupleResult {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const words = hex.length >= 64 ? hex.match(/.{1,64}/g) : null;
  if (!words || words.length < 1) {
    throw new QuoteNotAvailableError("Unable to decode quoter response");
  }

  const amountOut = hexToBigInt(`0x${words[0]}`);
  const amountIn = words[1] ? hexToBigInt(`0x${words[1]}`) : 0n;
  const sqrtAfter = words[2] ? hexToBigInt(`0x${words[2]}`) : 0n;
  const ticksCrossed = words[3] ? Number(hexToBigInt(`0x${words[3]}`)) : 0;
  const gasEstimate = words[4] ? hexToBigInt(`0x${words[4]}`) : 0n;
  const fee = words[5] ? Number(hexToBigInt(`0x${words[5]}`)) : 0;

  return [amountOut, amountIn, sqrtAfter, ticksCrossed, gasEstimate, fee];
}

/**
 * Quote an exact-input swap via QuoterV2 (off-chain eth_call only).
 */
export async function quoteExactIn(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<SwapQuote> {
  assertQuickSwapDeployed();
  const { contracts } = getQuickSwapEnv();
  const client = getQuickSwapPublicClient();

  const params = {
    tokenIn,
    tokenOut,
    deployer: ZERO_DEPLOYER,
    amountIn,
    limitSqrtPrice: 0n,
  } as const;

  try {
    const { result } = await client.simulateContract({
      address: contracts.quoterV2,
      abi: quoterV2QuoteAbi,
      functionName: "quoteExactInputSingle",
      args: [params],
    });
    return mapQuoteResult(tokenIn, tokenOut, amountIn, result as QuoteTupleResult);
  } catch {
    // Fallback: trimmed ABI first failed — try full ABI simulate, then raw decode.
    try {
      const { result } = await client.simulateContract({
        address: contracts.quoterV2,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [params],
      });
      return mapQuoteResult(tokenIn, tokenOut, amountIn, result as QuoteTupleResult);
    } catch {
      const result = await quoteViaRawCall(
        contracts.quoterV2,
        tokenIn,
        tokenOut,
        amountIn,
      );
      return mapQuoteResult(tokenIn, tokenOut, amountIn, result);
    }
  }
}
