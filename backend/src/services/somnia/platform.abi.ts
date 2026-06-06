import type { Abi } from "viem";

export const ResponseStatus = {
  None: 0,
  Pending: 1,
  Success: 2,
  Failed: 3,
  TimedOut: 4,
} as const;

export type ResponseStatusCode =
  (typeof ResponseStatus)[keyof typeof ResponseStatus];

export function responseStatusLabel(status: number): string {
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

/** Somnia agent platform contract — createRequest / getRequest / events. */
export const platformAbi = [
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

/** LLM Inference agent — `inferString`. */
export const inferStringAbi = [
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
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

/** LLM Inference agent — `inferToolsChat` (tool-calling). */
export const inferToolsChatAbi = [
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
    stateMutability: "nonpayable",
  },
] as const satisfies Abi;

export type AgentMethod = "inferString" | "inferToolsChat";

export function agentMethodAbi(method: AgentMethod) {
  return method === "inferString" ? inferStringAbi : inferToolsChatAbi;
}
