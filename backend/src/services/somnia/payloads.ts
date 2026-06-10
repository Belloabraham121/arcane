import { encodeFunctionData, type Hex } from "viem";
import { inferStringAbi, inferToolsChatAbi } from "./platform.abi";
import type { InferStringParams, InferToolsChatParams } from "./types";

export function encodeInferStringPayload(params: InferStringParams): Hex {
  return encodeFunctionData({
    abi: inferStringAbi,
    functionName: "inferString",
    args: [
      params.prompt,
      params.system,
      params.chainOfThought ?? false,
      params.allowedValues ?? [],
    ],
  });
}

export function encodeInferToolsChatPayload(params: InferToolsChatParams): Hex {
  return encodeFunctionData({
    abi: inferToolsChatAbi,
    functionName: "inferToolsChat",
    args: [
      params.roles,
      params.messages,
      params.mcpServerUrls ?? [],
      params.onchainTools ?? [],
      params.maxIterations ?? 3n,
      params.chainOfThought ?? false,
    ],
  });
}
