import type { Hash, Hex } from "viem";
import type { AgentMethod } from "./platform.abi";

export type OnchainToolDef = {
  signature: string;
  description: string;
};

export type InferStringParams = {
  prompt: string;
  system: string;
  chainOfThought?: boolean;
  allowedValues?: string[];
};

export type InferToolsChatParams = {
  roles: string[];
  messages: string[];
  mcpServerUrls?: string[];
  onchainTools?: OnchainToolDef[];
  maxIterations?: bigint;
  chainOfThought?: boolean;
};

export type InferStringResult = {
  response: string;
};

export type InferToolsChatResult = {
  finishReason: string;
  response: string;
  updatedRoles: string[];
  updatedMessages: string[];
  pendingToolCallIds: string[];
  pendingToolCalls: Hex[];
};

export type AgentRequestDepositQuote = {
  reserve: bigint;
  reward: bigint;
  deposit: bigint;
  perAgentCostWei: bigint;
  subcommitteeSize: bigint;
};

export type CreateAgentRequestResult = {
  requestId: bigint;
  txHash: Hash;
  deposit: bigint;
  blockNumber: bigint;
};

export type AgentRequestResult<T = unknown> = {
  requestId: bigint;
  txHash: Hash;
  finalizedStatus: number;
  decoded: T;
  rawResult: Hex;
};

export type InvokeAgentOptions = {
  method: AgentMethod;
  payload: Hex;
  agentId?: bigint;
  perAgentCostWei?: bigint;
  timeoutMs?: number;
};
