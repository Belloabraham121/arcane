/**
 * Smoke-test Somnia LLM Inference via the platform contract (dev-only).
 * Production code lives in src/services/somnia/agent-caller.ts.
 *
 * Usage:
 *   cp .env.example .env   # set PRIVATE_KEY + optional overrides
 *   npm run smoke:llm:check
 *   npm run smoke:llm
 */

import "dotenv/config";
import { formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaAgentChain } from "../src/config/somnia-chain";
import { getSomniaAgentEnv } from "../src/config/env";
import { invokeAgent, quoteRequestDeposit } from "../src/services/somnia/agent-caller";
import {
  encodeInferStringPayload,
  encodeInferToolsChatPayload,
} from "../src/services/somnia/payloads";
import type { AgentMethod } from "../src/services/somnia/platform.abi";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseMethod(argv: string[]): AgentMethod {
  const flag = argv.find((a) => a.startsWith("--method="));
  const method = (flag?.split("=")[1] ??
    process.env.SOMNIA_LLM_METHOD ??
    "inferString") as AgentMethod;
  if (method !== "inferString" && method !== "inferToolsChat") {
    throw new Error(`Unknown method "${method}". Use inferString or inferToolsChat.`);
  }
  return method;
}

function buildPayload(method: AgentMethod): Hex {
  if (method === "inferString") {
    const allowedRaw = process.env.SOMNIA_LLM_ALLOWED_VALUES?.trim();
    return encodeInferStringPayload({
      prompt:
        process.env.SOMNIA_LLM_PROMPT ??
        'Reply with exactly one word: "pong" (no punctuation).',
      system:
        process.env.SOMNIA_LLM_SYSTEM ?? "You are a minimal smoke-test assistant.",
      chainOfThought: process.env.SOMNIA_LLM_CHAIN_OF_THOUGHT === "true",
      allowedValues: allowedRaw
        ? allowedRaw.split(",").map((s) => s.trim())
        : [],
    });
  }

  return encodeInferToolsChatPayload({
    roles: ["system", "user"],
    messages: [
      process.env.SOMNIA_LLM_SYSTEM ??
        "You are a helpful assistant. Answer briefly.",
      process.env.SOMNIA_LLM_PROMPT ??
        "What is 2 + 2? Reply with just the number.",
    ],
    maxIterations: BigInt(process.env.SOMNIA_LLM_MAX_ITERATIONS ?? "3"),
    chainOfThought: process.env.SOMNIA_LLM_CHAIN_OF_THOUGHT === "true",
  });
}

async function main() {
  const checkOnly = process.argv.includes("--check-only");
  const method = parseMethod(process.argv);
  const agentEnv = getSomniaAgentEnv();

  const payload = buildPayload(method);

  console.log("Somnia LLM smoke test");
  console.log("  network:     ", somniaAgentChain.name, `(chainId ${somniaAgentChain.id})`);
  console.log("  platform:    ", agentEnv.agentPlatform);
  console.log("  agentId:     ", agentEnv.llmAgentId.toString());
  console.log("  method:      ", method);
  console.log("  rpc (http):  ", agentEnv.rpcHttp);
  console.log("  rpc (ws):    ", agentEnv.rpcWs);

  const { deposit, reserve, reward } = await quoteRequestDeposit();
  console.log("  deposit:     ", formatEther(deposit), "STT");
  console.log("    (reserve ", formatEther(reserve), "+ reward", formatEther(reward), ")");

  if (checkOnly) {
    console.log("\n--check-only: payload encoded, deposit quoted. Set PRIVATE_KEY to run live.");
    console.log("  payload (first 66 chars):", payload.slice(0, 66) + "...");
    return;
  }

  const privateKey = env("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);

  const result = await invokeAgent(account, { method, payload });

  console.log("\nAgent result:");
  console.log(
    JSON.stringify(
      result.decoded,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
  console.log("  requestId:   ", result.requestId.toString());
  console.log("  tx:          ", result.txHash);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
