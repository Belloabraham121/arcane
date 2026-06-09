import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getSomniaAgentEnv } from "../../src/config/env";
import { invokeAgent } from "../../src/services/somnia/agent-caller";
import {
  encodeInferStringPayload,
  encodeInferToolsChatPayload,
} from "../../src/services/somnia/payloads";
import type { InferStringResult, InferToolsChatResult } from "../../src/services/somnia/types";

const runLlmTests = process.env.RUN_LLM_TESTS === "1";
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const describeLlm = runLlmTests && privateKey ? describe : describe.skip;

const agentEnv = getSomniaAgentEnv();
/** Node test timeout must exceed Somnia finalization budget. */
const LLM_TIMEOUT_MS = agentEnv.requestTimeoutMs + 120_000;

describeLlm("Somnia LLM platform (live)", { concurrency: 1 }, () => {
  const account = privateKey ? privateKeyToAccount(privateKey) : null;

  it(
    "inferString returns a non-empty response",
    { timeout: LLM_TIMEOUT_MS },
    async () => {
      assert.ok(account);

      const payload = encodeInferStringPayload({
        prompt: 'Reply with exactly one word: "pong" (no punctuation).',
        system: "You are a minimal test assistant.",
        chainOfThought: false,
        allowedValues: [],
      });

      const result = await invokeAgent<InferStringResult>(account, {
        method: "inferString",
        payload,
        timeoutMs: agentEnv.requestTimeoutMs,
      });

      assert.ok(result.decoded.response.trim().length > 0);
      assert.ok(result.requestId > 0n);
      assert.match(result.txHash, /^0x[a-fA-F0-9]{64}$/);
    },
  );

  it(
    "inferToolsChat returns stop or tool_calls",
    { timeout: LLM_TIMEOUT_MS },
    async () => {
      assert.ok(account);

      const payload = encodeInferToolsChatPayload({
        roles: ["system", "user"],
        messages: [
          "You are a helpful assistant. Answer briefly with one short sentence.",
          "What is 2 + 2? Reply with just the number.",
        ],
        maxIterations: 3n,
        chainOfThought: false,
      });

      const result = await invokeAgent<InferToolsChatResult>(account, {
        method: "inferToolsChat",
        payload,
        timeoutMs: agentEnv.requestTimeoutMs,
      });

      assert.ok(
        result.decoded.finishReason === "stop" ||
          result.decoded.finishReason === "tool_calls",
      );
      if (result.decoded.finishReason === "stop") {
        assert.ok(result.decoded.response.trim().length > 0);
      }
    },
  );
});
