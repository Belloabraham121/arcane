import type { Address } from "viem";
import { encodeFunctionData, hexToBigInt, isHex } from "viem";
import { ZERO_DEPLOYER } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { quoterV2Abi, quoterV2QuoteAbi } from "./abis";
import { getQuickSwapPublicClient } from "./client";
import {
  emptyPluginDataForHops,
  encodeAlgebraSwapPath,
} from "./path-encoding";
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

type MultihopQuoteResult = readonly [
  readonly bigint[],
  readonly bigint[],
  readonly bigint[],
  readonly number[],
  bigint,
  readonly number[],
];

function mapMultihopQuoteResult(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  result: MultihopQuoteResult,
): SwapQuote {
  const [
    amountOutList,
    ,
    sqrtAfterList,
    ticksList,
    gasEstimate,
    feeList,
  ] = result;

  const amountOut = amountOutList[amountOutList.length - 1] ?? 0n;
  const sqrtPriceX96After = sqrtAfterList[sqrtAfterList.length - 1] ?? 0n;
  const initializedTicksCrossed = ticksList.reduce((sum, n) => sum + n, 0);
  const fee = feeList[feeList.length - 1] ?? 0;

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
 * Quote a multihop exact-input swap via QuoterV2.quoteExactInput.
 */
export async function quoteExactInputPath(
  tokens: readonly Address[],
  amountIn: bigint,
): Promise<SwapQuote> {
  assertQuickSwapDeployed();

  if (tokens.length < 2) {
    throw new QuoteNotAvailableError("path must contain at least two tokens");
  }

  const { contracts } = getQuickSwapEnv();
  const client = getQuickSwapPublicClient();
  const tokenIn = tokens[0]!;
  const tokenOut = tokens[tokens.length - 1]!;
  const path = encodeAlgebraSwapPath(tokens);
  const pluginsData = [...emptyPluginDataForHops(tokens.length - 1)];

  try {
    const { result } = await client.simulateContract({
      address: contracts.quoterV2,
      abi: quoterV2Abi,
      functionName: "quoteExactInput",
      args: [path, pluginsData, amountIn],
    });

    return mapMultihopQuoteResult(
      tokenIn,
      tokenOut,
      amountIn,
      result as MultihopQuoteResult,
    );
  } catch {
    // Somnia QuoterV2 multihop often reverts; chain single-hop quotes instead.
    return quoteExactInputPathChained(tokens, amountIn);
  }
}

async function quoteExactInputPathChained(
  tokens: readonly Address[],
  amountIn: bigint,
): Promise<SwapQuote> {
  const tokenIn = tokens[0]!;
  const tokenOut = tokens[tokens.length - 1]!;
  let currentIn = amountIn;
  let lastQuote: SwapQuote | null = null;
  let totalTicks = 0;
  let totalGas = 0n;

  for (let i = 0; i < tokens.length - 1; i++) {
    lastQuote = await quoteExactIn(tokens[i]!, tokens[i + 1]!, currentIn);
    currentIn = BigInt(lastQuote.amountOut);
    totalTicks += lastQuote.initializedTicksCrossed;
    totalGas += BigInt(lastQuote.gasEstimate);
  }

  if (!lastQuote) {
    throw new QuoteNotAvailableError("Unable to quote swap path");
  }

  return {
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    amountOut: lastQuote.amountOut,
    sqrtPriceX96After: lastQuote.sqrtPriceX96After,
    initializedTicksCrossed: totalTicks,
    gasEstimate: totalGas.toString(),
    fee: lastQuote.fee,
  };
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
