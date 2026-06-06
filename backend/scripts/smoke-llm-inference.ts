/**
 * Smoke-test Somnia LLM Inference via the platform contract (TypeScript + viem).
 *
 * Pattern: createRequest with no callback (zero address), watch RequestFinalized,
 * then read getRequest and decode the agent result.
 *
 * @see https://docs.somnia.network/agents/base-agents/llm-inference
 * @see https://docs.somnia.network/agents/invoking-agents/gas-fees
 *
 * Usage:
 *   cp .env.example .env   # set PRIVATE_KEY + optional overrides
 *   npm install
 *   npm run smoke:llm:check
 *   npm run smoke:llm
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  formatEther,
  http,
  webSocket,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaChain } from "../src/config/somnia-chain";

const SUBCOMMITTEE_SIZE = 3n;

const ResponseStatus = {
  None: 0,
  Pending: 1,
  Success: 2,
  Failed: 3,
  TimedOut: 4,
} as const;

const platformAbi = [
  {
    type: "function",
    name: "createRequest",
    inputs: [
      { type: "uint256", name: "agentId" },
      { type: "address", name: "callbackAddress" },
      { type: "bytes4", name: "callbackSelector" },
      { type: "bytes", name: "payload" },
    ],
    outputs: [{ type: "uint256", name: "requestId" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getRequestDeposit",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRequest",
    inputs: [{ type: "uint256", name: "requestId" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint256", name: "id" },
          { type: "address", name: "requester" },
          { type: "address", name: "callbackAddress" },
          { type: "bytes4", name: "callbackSelector" },
          { type: "address[]", name: "subcommittee" },
          {
            type: "tuple[]",
            name: "responses",
            components: [
              { type: "address", name: "validator" },
              { type: "bytes", name: "result" },
              { type: "uint8", name: "status" },
              { type: "uint256", name: "receipt" },
              { type: "uint256", name: "timestamp" },
              { type: "uint256", name: "executionCost" },
            ],
          },
          { type: "uint256", name: "responseCount" },
          { type: "uint256", name: "failureCount" },
          { type: "uint256", name: "threshold" },
          { type: "uint256", name: "createdAt" },
          { type: "uint256", name: "deadline" },
          { type: "uint8", name: "status" },
          { type: "uint8", name: "consensusType" },
          { type: "uint256", name: "remainingBudget" },
          { type: "uint256", name: "perAgentBudget" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "RequestCreated",
    inputs: [
      { type: "uint256", name: "requestId", indexed: true },
      { type: "uint256", name: "agentId", indexed: true },
      { type: "uint256", name: "perAgentBudget", indexed: false },
      { type: "bytes", name: "payload", indexed: false },
      { type: "address[]", name: "subcommittee", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RequestFinalized",
    inputs: [
      { type: "uint256", name: "requestId", indexed: true },
      { type: "uint8", name: "status", indexed: false },
    ],
  },
] as const satisfies Abi;

const inferStringAbi = [
  {
    type: "function",
    name: "inferString",
    inputs: [
      { type: "string", name: "prompt" },
      { type: "string", name: "system" },
      { type: "bool", name: "chainOfThought" },
      { type: "string[]", name: "allowedValues" },
    ],
    outputs: [{ type: "string", name: "response" }],
  },
] as const satisfies Abi;

const inferToolsChatAbi = [
  {
    type: "function",
    name: "inferToolsChat",
    inputs: [
      { type: "string[]", name: "roles" },
      { type: "string[]", name: "messages" },
      { type: "string[]", name: "mcpServerUrls" },
      {
        type: "tuple[]",
        name: "onchainTools",
        components: [
          { type: "string", name: "signature" },
          { type: "string", name: "description" },
        ],
      },
      { type: "uint256", name: "maxIterations" },
      { type: "bool", name: "chainOfThought" },
    ],
    outputs: [
      { type: "string", name: "finishReason" },
      { type: "string", name: "response" },
      { type: "string[]", name: "updatedRoles" },
      { type: "string[]", name: "updatedMessages" },
      { type: "string[]", name: "pendingToolCallIds" },
      { type: "bytes[]", name: "pendingToolCalls" },
    ],
  },
] as const satisfies Abi;

type AgentMethod = "inferString" | "inferToolsChat";

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
    const prompt =
      process.env.SOMNIA_LLM_PROMPT ??
      'Reply with exactly one word: "pong" (no punctuation).';
    const system =
      process.env.SOMNIA_LLM_SYSTEM ?? "You are a minimal smoke-test assistant.";
    const chainOfThought = process.env.SOMNIA_LLM_CHAIN_OF_THOUGHT === "true";
    const allowedRaw = process.env.SOMNIA_LLM_ALLOWED_VALUES?.trim();
    const allowedValues = allowedRaw
      ? allowedRaw.split(",").map((s) => s.trim())
      : [];

    return encodeFunctionData({
      abi: inferStringAbi,
      functionName: "inferString",
      args: [prompt, system, chainOfThought, allowedValues],
    });
  }

  const roles = ["system", "user"];
  const messages = [
    process.env.SOMNIA_LLM_SYSTEM ??
      "You are a helpful assistant. Answer briefly.",
    process.env.SOMNIA_LLM_PROMPT ?? "What is 2 + 2? Reply with just the number.",
  ];
  const mcpServerUrls: string[] = [];
  const onchainTools: { signature: string; description: string }[] = [];
  const maxIterations = BigInt(process.env.SOMNIA_LLM_MAX_ITERATIONS ?? "3");
  const chainOfThought = process.env.SOMNIA_LLM_CHAIN_OF_THOUGHT === "true";

  return encodeFunctionData({
    abi: inferToolsChatAbi,
    functionName: "inferToolsChat",
    args: [roles, messages, mcpServerUrls, onchainTools, maxIterations, chainOfThought],
  });
}

function statusLabel(status: number): string {
  switch (status) {
    case ResponseStatus.Success:
      return "Success";
    case ResponseStatus.Failed:
      return "Failed";
    case ResponseStatus.TimedOut:
      return "TimedOut";
    case ResponseStatus.Pending:
      return "Pending";
    default:
      return `Unknown(${status})`;
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check-only");
  const method = parseMethod(process.argv);

  const rpcHttp = env("SOMNIA_RPC_HTTP", "https://api.infra.testnet.somnia.network");
  const rpcWs =
    process.env.SOMNIA_RPC_WS ??
    (rpcHttp.includes("api.infra.testnet")
      ? "wss://dream-rpc.somnia.network/ws"
      : rpcHttp.replace(/^http/, "ws").replace(/\/$/, "") + "/ws");
  const platformAddress = env(
    "SOMNIA_AGENT_PLATFORM",
    "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776",
  ) as Hex;
  const agentId = BigInt(
    env("SOMNIA_LLM_AGENT_ID", "12847293847561029384"),
  );
  const perAgentCost = BigInt(
    process.env.SOMNIA_LLM_PER_AGENT_COST_WEI ?? "70000000000000000",
  );

  const payload = buildPayload(method);
  const agentAbi = method === "inferString" ? inferStringAbi : inferToolsChatAbi;

  const httpTransport = http(rpcHttp);
  const readClient = createPublicClient({
    chain: somniaChain,
    transport: httpTransport,
  });

  console.log("Somnia LLM smoke test");
  console.log("  network:     ", somniaChain.name, `(chainId ${somniaChain.id})`);
  console.log("  platform:    ", platformAddress);
  console.log("  agentId:     ", agentId.toString());
  console.log("  method:      ", method);
  console.log("  rpc (http):  ", rpcHttp);
  console.log("  rpc (ws):    ", rpcWs);

  const reserve = await readClient.readContract({
    address: platformAddress,
    abi: platformAbi,
    functionName: "getRequestDeposit",
  });
  const reward = perAgentCost * SUBCOMMITTEE_SIZE;
  const deposit = reserve + reward;

  console.log("  deposit:     ", formatEther(deposit), "STT");
  console.log("    (reserve ", formatEther(reserve), "+ reward", formatEther(reward), ")");

  if (checkOnly) {
    console.log("\n--check-only: payload encoded, deposit quoted. Set PRIVATE_KEY to run live.");
    console.log("  payload (first 66 chars):", payload.slice(0, 66) + "...");
    return;
  }

  const privateKey = env("PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);

  const balance = await readClient.getBalance({ address: account.address });
  console.log("  wallet:      ", account.address);
  console.log("  balance:     ", formatEther(balance), "STT");

  if (balance < deposit) {
    throw new Error(
      `Insufficient STT. Need at least ${formatEther(deposit)}; have ${formatEther(balance)}. Fund via https://testnet.somnia.network`,
    );
  }

  const walletClient = createWalletClient({
    account,
    chain: somniaChain,
    transport: httpTransport,
  });

  const wsClient = createPublicClient({
    chain: somniaChain,
    transport: webSocket(rpcWs),
  });

  console.log("\nSubmitting createRequest…");

  const hash = await walletClient.writeContract({
    address: platformAddress,
    abi: platformAbi,
    functionName: "createRequest",
    args: [
      agentId,
      "0x0000000000000000000000000000000000000000",
      "0x00000000",
      payload,
    ],
    value: deposit,
  });

  console.log("  tx:          ", hash);

  const receipt = await readClient.waitForTransactionReceipt({ hash });

  let requestId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: platformAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "RequestCreated") {
        requestId = decoded.args.requestId;
        break;
      }
    } catch {
      // not our event
    }
  }

  if (requestId == null) {
    throw new Error("RequestCreated event not found in transaction logs");
  }

  console.log("  requestId:   ", requestId.toString());
  console.log("\nWaiting for RequestFinalized (WebSocket)…");

  const timeoutMs = Number(process.env.SOMNIA_REQUEST_TIMEOUT_MS ?? "900000");
  const finalizedStatus = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for RequestFinalized`));
    }, timeoutMs);

    const unwatch = wsClient.watchContractEvent({
      address: platformAddress,
      abi: platformAbi,
      eventName: "RequestFinalized",
      onLogs: (logs) => {
        for (const log of logs) {
          if (log.args.requestId === requestId) {
            clearTimeout(timer);
            unwatch();
            resolve(Number(log.args.status));
          }
        }
      },
      onError: (err) => {
        clearTimeout(timer);
        unwatch();
        reject(err);
      },
    });
  });

  console.log("  finalized:   ", statusLabel(finalizedStatus));

  if (finalizedStatus !== ResponseStatus.Success) {
    const request = await readClient.readContract({
      address: platformAddress,
      abi: platformAbi,
      functionName: "getRequest",
      args: [requestId],
    });
    console.error("Request details:", {
      onChainStatus: request.status,
      responseCount: request.responseCount,
      failureCount: request.failureCount,
    });
    throw new Error(
      finalizedStatus === ResponseStatus.Failed
        ? "Agent execution failed (consensus: Failed)"
        : "Request timed out or did not succeed",
    );
  }

  const request = await readClient.readContract({
    address: platformAddress,
    abi: platformAbi,
    functionName: "getRequest",
    args: [requestId],
  });

  if (!request.responses?.length) {
    throw new Error("No validator responses on finalized request");
  }

  const responseBytes = request.responses[0].result;
  const decoded = decodeFunctionResult({
    abi: agentAbi,
    functionName: method,
    data: responseBytes,
  });

  console.log("\nAgent result:");
  console.log(JSON.stringify(decoded, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
