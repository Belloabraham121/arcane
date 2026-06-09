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

/** Reset cached RPC clients (tests). */
export function resetSomniaAgentClients(): void {
  httpClient = null;
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

  return { requestId, txHash, deposit, blockNumber: receipt.blockNumber };
}

type AgentRequestSnapshot = Awaited<ReturnType<typeof getAgentRequest>>;

const REQUEST_SNAPSHOT_POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `getRequest` reverts once the platform purges finalized requests — never throw here. */
async function readAgentRequestSnapshot(
  requestId: bigint,
): Promise<AgentRequestSnapshot | null> {
  try {
    return await getAgentRequest(requestId);
  } catch {
    return null;
  }
}

/**
 * Poll `getRequest` while the request is live. Somnia purges records within ~100ms
 * of finalization, so we must capture validator responses before `RequestFinalized`.
 */
function startRequestSnapshotPoller(
  requestId: bigint,
  deadlineMs: number,
): {
  getBest(): AgentRequestSnapshot | null;
  stop(): void;
} {
  let best: AgentRequestSnapshot | null = null;
  let stopped = false;

  const loop = async () => {
    while (!stopped && Date.now() < deadlineMs) {
      const snap = await readAgentRequestSnapshot(requestId);
      if (snap) {
        if ((snap.responses?.length ?? 0) > 0) {
          best = snap;
        } else {
          const status = Number(snap.status);
          if (
            status !== ResponseStatus.Pending &&
            status !== ResponseStatus.None
          ) {
            best = snap;
          }
        }
      }
      await sleep(REQUEST_SNAPSHOT_POLL_MS);
    }
  };

  void loop();

  return {
    getBest: () => best,
    stop: () => {
      stopped = true;
    },
  };
}

/** Wait for `RequestFinalized` via WebSocket subscription (filtered by requestId). */
async function waitForRequestFinalizedWs(
  requestId: bigint,
  timeoutMs: number,
): Promise<{ status: number; label: string }> {
  const env = getSomniaAgentEnv();
  const ws = createPublicClient({
    chain: somniaAgentChain,
    transport: webSocket(env.rpcWs),
  });

  const status = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      unwatch();
      reject(
        new SomniaAgentError(
          `Timed out after ${timeoutMs}ms waiting for RequestFinalized`,
          "REQUEST_TIMEOUT",
        ),
      );
    }, timeoutMs);

    const unwatch = ws.watchContractEvent({
      address: env.agentPlatform,
      abi: platformAbi,
      eventName: "RequestFinalized",
      args: { requestId },
      onLogs: (logs) => {
        clearTimeout(timer);
        unwatch();
        resolve(Number(logs[0]!.args.status));
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

const LOG_SCAN_CHUNK_SIZE = 49n;
const LOG_SCAN_INTERVAL_MS = 5_000;

/** Scan `RequestFinalized` logs when WebSocket delivery is slow or unavailable. */
async function waitForRequestFinalizedLogs(
  requestId: bigint,
  fromBlock: bigint,
  timeoutMs: number,
): Promise<{ status: number; label: string }> {
  const env = getSomniaAgentEnv();
  const client = getHttpClient();
  const deadline = Date.now() + timeoutMs;
  let cursor = fromBlock;

  while (Date.now() < deadline) {
    const latest = await client.getBlockNumber();

    while (cursor <= latest && Date.now() < deadline) {
      const to =
        cursor + LOG_SCAN_CHUNK_SIZE > latest
          ? latest
          : cursor + LOG_SCAN_CHUNK_SIZE;

      try {
        const logs = await client.getLogs({
          address: env.agentPlatform,
          abi: platformAbi,
          eventName: "RequestFinalized",
          fromBlock: cursor,
          toBlock: to,
        });
        const match = logs.find((entry) => entry.args.requestId === requestId);
        if (match) {
          const status = Number(match.args.status);
          return { status, label: responseStatusLabel(status) };
        }
      } catch (err) {
        log.debug("RequestFinalized log scan chunk failed", {
          requestId: requestId.toString(),
          fromBlock: cursor.toString(),
          toBlock: to.toString(),
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      cursor = to + 1n;
    }

    await sleep(LOG_SCAN_INTERVAL_MS);
  }

  throw new SomniaAgentError(
    `Timed out after ${timeoutMs}ms scanning RequestFinalized logs`,
    "REQUEST_TIMEOUT",
  );
}

export type RequestFinalizationResult = {
  status: number;
  label: string;
  snapshot: AgentRequestSnapshot | null;
};

/**
 * Wait for request finalization. Runs a fast `getRequest` poller in parallel because
 * Somnia purges request storage immediately after `RequestFinalized`.
 */
export async function waitForRequestFinalized(
  requestId: bigint,
  timeoutMs?: number,
  fromBlock?: bigint,
): Promise<RequestFinalizationResult> {
  const env = getSomniaAgentEnv();
  const timeout = timeoutMs ?? env.requestTimeoutMs;
  const deadline = Date.now() + timeout;
  const poller = startRequestSnapshotPoller(requestId, deadline);

  const waiters: Promise<{ status: number; label: string }>[] = [
    waitForRequestFinalizedWs(requestId, timeout),
  ];
  if (fromBlock != null) {
    waiters.push(waitForRequestFinalizedLogs(requestId, fromBlock, timeout));
  }

  try {
    const { status, label } = await Promise.any(waiters);
    await sleep(250);
    return { status, label, snapshot: poller.getBest() };
  } finally {
    poller.stop();
  }
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
  const { requestId, txHash, blockNumber } = await createAgentRequest(
    account,
    options.payload,
    {
      agentId: options.agentId,
      perAgentCostWei: options.perAgentCostWei,
    },
  );

  log.info("Waiting for agent request finalization", {
    requestId: requestId.toString(),
    txHash,
  });

  const { status, label, snapshot } = await waitForRequestFinalized(
    requestId,
    options.timeoutMs,
    blockNumber,
  );

  if (status !== ResponseStatus.Success) {
    log.error("Agent request failed", {
      requestId: requestId.toString(),
      finalizedStatus: label,
      onChainStatus: snapshot ? Number(snapshot.status) : null,
      responseCount: snapshot?.responseCount?.toString() ?? null,
      failureCount: snapshot?.failureCount?.toString() ?? null,
    });

    throw new SomniaAgentError(
      status === ResponseStatus.Failed
        ? "Agent execution failed (consensus: Failed)"
        : `Agent request did not succeed (${label})`,
      "AGENT_REQUEST_FAILED",
    );
  }

  const request =
    snapshot ?? (await readAgentRequestSnapshot(requestId));
  if (!request?.responses?.length) {
    throw new SomniaAgentError(
      "No validator responses on finalized request (request purged before snapshot)",
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
