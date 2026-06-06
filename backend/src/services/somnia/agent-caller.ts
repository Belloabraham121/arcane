import type { Hash, Hex, PublicClient } from "viem";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionResult,
  http,
  webSocket,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { getSomniaAgentEnv } from "../../config/env";
import { somniaAgentChain } from "../../config/somnia-chain";
import { createLogger } from "../../shared/logger";
import {
  agentMethodAbi,
  platformAbi,
  ResponseStatus,
  responseStatusLabel,
  type AgentMethod,
} from "./platform.abi";
import type {
  AgentRequestDepositQuote,
  AgentRequestResult,
  CreateAgentRequestResult,
  InvokeAgentOptions,
} from "./types";

const log = createLogger("somnia-agent");

export class SomniaAgentError extends Error {
  constructor(
    message: string,
    readonly code = "SOMNIA_AGENT_ERROR",
  ) {
    super(message);
    this.name = "SomniaAgentError";
  }
}

const ZERO_CALLBACK_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_CALLBACK_SELECTOR = "0x00000000" as const;

let httpClient: PublicClient | null = null;
let wsClient: PublicClient | null = null;

function getHttpClient(): PublicClient {
  if (!httpClient) {
    const { rpcHttp } = getSomniaAgentEnv();
    httpClient = createPublicClient({
      chain: somniaAgentChain,
      transport: http(rpcHttp),
    });
  }
  return httpClient;
}

function getWsClient(): PublicClient {
  if (!wsClient) {
    const { rpcWs } = getSomniaAgentEnv();
    wsClient = createPublicClient({
      chain: somniaAgentChain,
      transport: webSocket(rpcWs),
    });
  }
  return wsClient;
}

/** Reset cached RPC clients (tests). */
export function resetSomniaAgentClients(): void {
  httpClient = null;
  wsClient = null;
}

/** Quote STT deposit for one agent request (reserve + subcommittee reward). */
export async function quoteRequestDeposit(
  perAgentCostWei?: bigint,
): Promise<AgentRequestDepositQuote> {
  const env = getSomniaAgentEnv();
  const cost = perAgentCostWei ?? env.llmPerAgentCostWei;
  const client = getHttpClient();

  const reserve = await client.readContract({
    address: env.agentPlatform,
    abi: platformAbi,
    functionName: "getRequestDeposit",
  });

  const reward = cost * env.subcommitteeSize;
  return {
    reserve,
    reward,
    deposit: reserve + reward,
    perAgentCostWei: cost,
    subcommitteeSize: env.subcommitteeSize,
  };
}

/**
 * Submit `createRequest` on the Somnia agent platform (no callback — poll for result).
 */
export async function createAgentRequest(
  account: PrivateKeyAccount,
  payload: Hex,
  options?: {
    agentId?: bigint;
    perAgentCostWei?: bigint;
  },
): Promise<CreateAgentRequestResult> {
  const env = getSomniaAgentEnv();
  const agentId = options?.agentId ?? env.llmAgentId;
  const { deposit } = await quoteRequestDeposit(options?.perAgentCostWei);

  const client = getHttpClient();
  const balance = await client.getBalance({ address: account.address });
  if (balance < deposit) {
    throw new SomniaAgentError(
      `Insufficient STT for agent request. Need ${deposit} wei; have ${balance} wei`,
      "INSUFFICIENT_STT",
    );
  }

  const walletClient = createWalletClient({
    account,
    chain: somniaAgentChain,
    transport: http(env.rpcHttp),
  });

  log.info("Creating Somnia agent request", {
    agentId: agentId.toString(),
    requester: account.address,
    deposit: deposit.toString(),
  });

  const txHash = await walletClient.writeContract({
    address: env.agentPlatform,
    abi: platformAbi,
    functionName: "createRequest",
    args: [agentId, ZERO_CALLBACK_ADDRESS, ZERO_CALLBACK_SELECTOR, payload],
    value: deposit,
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });

  let requestId: bigint | undefined;
  for (const entry of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: platformAbi,
        data: entry.data,
        topics: entry.topics,
      });
      if (decoded.eventName === "RequestCreated") {
        requestId = decoded.args.requestId;
        break;
      }
    } catch {
      // unrelated log
    }
  }

  if (requestId == null) {
    throw new SomniaAgentError(
      "RequestCreated event not found in transaction receipt",
      "REQUEST_ID_NOT_FOUND",
    );
  }

  return { requestId, txHash, deposit };
}

/** Wait for `RequestFinalized` via WebSocket subscription. */
export async function waitForRequestFinalized(
  requestId: bigint,
  timeoutMs?: number,
): Promise<{ status: number; label: string }> {
  const env = getSomniaAgentEnv();
  const timeout = timeoutMs ?? env.requestTimeoutMs;
  const ws = getWsClient();

  const status = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch();
      reject(
        new SomniaAgentError(
          `Timed out after ${timeout}ms waiting for RequestFinalized`,
          "REQUEST_TIMEOUT",
        ),
      );
    }, timeout);

    const unwatch = ws.watchContractEvent({
      address: env.agentPlatform,
      abi: platformAbi,
      eventName: "RequestFinalized",
      onLogs: (logs) => {
        for (const entry of logs) {
          if (entry.args.requestId === requestId) {
            clearTimeout(timer);
            unwatch();
            resolve(Number(entry.args.status));
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

  return { status, label: responseStatusLabel(status) };
}

/** Read on-chain request state after finalization. */
export async function getAgentRequest(requestId: bigint) {
  const env = getSomniaAgentEnv();
  const client = getHttpClient();
  return client.readContract({
    address: env.agentPlatform,
    abi: platformAbi,
    functionName: "getRequest",
    args: [requestId],
  });
}

/** Decode validator response bytes for a given agent method. */
export function decodeAgentResponse<T = unknown>(
  method: AgentMethod,
  resultBytes: Hex,
): T {
  return decodeFunctionResult({
    abi: agentMethodAbi(method),
    functionName: method,
    data: resultBytes,
  }) as T;
}

/**
 * Full flow: createRequest → wait for RequestFinalized → decode agent result.
 */
export async function invokeAgent<T = unknown>(
  account: PrivateKeyAccount,
  options: InvokeAgentOptions,
): Promise<AgentRequestResult<T>> {
  const { requestId, txHash } = await createAgentRequest(account, options.payload, {
    agentId: options.agentId,
    perAgentCostWei: options.perAgentCostWei,
  });

  log.info("Waiting for agent request finalization", {
    requestId: requestId.toString(),
    txHash,
  });

  const { status, label } = await waitForRequestFinalized(
    requestId,
    options.timeoutMs,
  );

  if (status !== ResponseStatus.Success) {
    const request = await getAgentRequest(requestId);
    log.error("Agent request failed", {
      requestId: requestId.toString(),
      finalizedStatus: label,
      onChainStatus: request.status,
      responseCount: request.responseCount.toString(),
      failureCount: request.failureCount.toString(),
    });

    throw new SomniaAgentError(
      status === ResponseStatus.Failed
        ? "Agent execution failed (consensus: Failed)"
        : `Agent request did not succeed (${label})`,
      "AGENT_REQUEST_FAILED",
    );
  }

  const request = await getAgentRequest(requestId);
  if (!request.responses?.length) {
    throw new SomniaAgentError(
      "No validator responses on finalized request",
      "EMPTY_RESPONSE",
    );
  }

  const rawResult = request.responses[0]!.result as Hex;
  const decoded = decodeAgentResponse<T>(options.method, rawResult);

  log.info("Agent request succeeded", {
    requestId: requestId.toString(),
    method: options.method,
  });

  return {
    requestId,
    txHash,
    finalizedStatus: status,
    decoded,
    rawResult,
  };
}
