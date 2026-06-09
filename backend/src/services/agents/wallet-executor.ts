import type { Address, Hash, Hex } from "viem";
import { createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getQuickSwapEnv } from "../../config/env";
import {
  resolveSlippageBps,
  RiskControlError,
  type EffectiveRiskLimits,
} from "./risk-controls.service";

function resolveSwapSlippageBps(
  requestedBps: number | undefined,
  riskLimits: EffectiveRiskLimits,
): number {
  try {
    return resolveSlippageBps(requestedBps, riskLimits);
  } catch (err) {
    if (err instanceof RiskControlError) {
      throw new WalletExecutorError(err.message, err.code);
    }
    throw err;
  }
}
import { somniaMainnetChain } from "../../config/somnia-chain";
import { createLogger } from "../../shared/logger";
import { emailWalletService } from "../auth/email-wallet.service";
import { findUserWalletCredentials } from "../auth/user.repository";
import { erc20MinimalAbi } from "../defi/quickswap/abis";
import { getQuickSwapPublicClient } from "../defi/quickswap/client";
import { buildApprove } from "../defi/quickswap/swap.service";
import type { EncodedTxCall, RebalanceSwapPlan } from "../defi/quickswap/types";
import { resolveTokensForPools } from "../wallet/token-balance.service";

const log = createLogger("wallet-executor");

export class WalletExecutorError extends Error {
  constructor(
    message: string,
    readonly code = "WALLET_EXECUTOR_ERROR",
  ) {
    super(message);
    this.name = "WalletExecutorError";
  }
}

export type SubmittedTransaction = {
  kind: "approve" | "swap";
  hash: Hash;
  status: "success" | "reverted";
  tokenIn?: Address;
  tokenOut?: Address;
  amountIn?: bigint;
  amountOut?: bigint;
};

type AgentAccount = ReturnType<typeof privateKeyToAccount>;

type ForkImpersonateAccount = {
  address: Address;
  type: "json-rpc";
};

export type AgentSigningSession = {
  mode: "fork_impersonate";
  walletAddress: Address;
};

const accountCache = new Map<string, AgentAccount>();
let activeSigningSession: AgentSigningSession | null = null;

/** Demo fork cycles sign as the shared demo wallet via Anvil impersonation. */
export function setAgentSigningSession(session: AgentSigningSession | null): void {
  activeSigningSession = session;
}

async function resolveAgentAccount(userId: string): Promise<{
  account: AgentAccount | ForkImpersonateAccount;
  walletAddress: Address;
}> {
  if (activeSigningSession?.mode === "fork_impersonate") {
    return {
      account: {
        address: activeSigningSession.walletAddress,
        type: "json-rpc",
      },
      walletAddress: activeSigningSession.walletAddress,
    };
  }

  return getUserAgentAccount(userId);
}

function normalizePrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as Hex;
}

/** Load the user's custodial agent account for signing (mainnet swaps + testnet LLM). */
export async function getUserAgentAccount(userId: string): Promise<{
  account: AgentAccount;
  walletAddress: Address;
}> {
  const cached = accountCache.get(userId);
  if (cached) {
    return { account: cached, walletAddress: cached.address };
  }

  const credentials = await findUserWalletCredentials(userId);
  if (!credentials) {
    throw new WalletExecutorError("User wallet not found", "WALLET_NOT_FOUND");
  }
  if (!isAddress(credentials.walletAddress)) {
    throw new WalletExecutorError("Invalid wallet address on file", "INVALID_WALLET");
  }

  const privateKey = normalizePrivateKey(
    emailWalletService.decryptStoredPrivateKey(credentials.encryptedPrivateKey),
  );
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== credentials.walletAddress.toLowerCase()) {
    throw new WalletExecutorError(
      "Decrypted wallet does not match stored address",
      "WALLET_MISMATCH",
    );
  }

  accountCache.set(userId, account);
  return { account, walletAddress: credentials.walletAddress };
}

function getAgentWalletClient(account: AgentAccount | ForkImpersonateAccount) {
  const { rpcHttp } = getQuickSwapEnv();
  return createWalletClient({
    account,
    chain: somniaMainnetChain,
    transport: http(rpcHttp),
  });
}

async function assertTokenAllowed(
  userId: string,
  token: Address,
  allowedPoolIds: readonly string[],
): Promise<void> {
  const allowed = await resolveTokensForPools([...allowedPoolIds]);
  const ok = allowed.some(
    (entry) => entry.address.toLowerCase() === token.toLowerCase(),
  );
  if (!ok) {
    throw new WalletExecutorError(
      `Token ${token} is not in the user's selected pools`,
      "TOKEN_NOT_ALLOWED",
    );
  }

}

async function assertSufficientBalance(
  walletAddress: Address,
  token: Address,
  amount: bigint,
): Promise<void> {
  const client = getQuickSwapPublicClient();
  const balance = await client.readContract({
    address: token,
    abi: erc20MinimalAbi,
    functionName: "balanceOf",
    args: [walletAddress],
  });

  if (balance < amount) {
    throw new WalletExecutorError(
      "Insufficient token balance for swap",
      "INSUFFICIENT_BALANCE",
    );
  }
}

async function assertSufficientGas(walletAddress: Address): Promise<void> {
  const client = getQuickSwapPublicClient();
  const native = await client.getBalance({ address: walletAddress });
  if (native === 0n) {
    throw new WalletExecutorError(
      "Agent wallet has no SOMI for gas — fund the wallet on Somnia mainnet",
      "INSUFFICIENT_GAS",
    );
  }
}

export async function getTokenAllowance(
  walletAddress: Address,
  token: Address,
  spender: Address,
): Promise<bigint> {
  const client = getQuickSwapPublicClient();
  return client.readContract({
    address: token,
    abi: erc20MinimalAbi,
    functionName: "allowance",
    args: [walletAddress, spender],
  });
}

/**
 * Sign and broadcast a transaction from the user's custodial agent wallet.
 * No browser wallet or user approval step.
 */
export async function submitAgentTransaction(
  userId: string,
  call: EncodedTxCall,
  kind: SubmittedTransaction["kind"],
  meta?: Pick<SubmittedTransaction, "tokenIn" | "tokenOut" | "amountIn" | "amountOut">,
): Promise<SubmittedTransaction> {
  const { account, walletAddress } = await resolveAgentAccount(userId);
  await assertSufficientGas(walletAddress);

  const walletClient = getAgentWalletClient(account);
  const publicClient = getQuickSwapPublicClient();
  const { txReceiptTimeoutMs } = getQuickSwapEnv();

  log.info("Submitting agent transaction", {
    userId,
    kind,
    to: call.to,
    walletAddress,
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain: somniaMainnetChain,
    to: call.to,
    data: call.data,
    value: call.value ?? 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: txReceiptTimeoutMs,
  });

  const status = receipt.status === "success" ? "success" : "reverted";
  if (status === "reverted") {
    throw new WalletExecutorError(
      `Transaction reverted: ${hash}`,
      "TX_REVERTED",
    );
  }

  return {
    kind,
    hash,
    status,
    ...meta,
  };
}

/**
 * Ensure ERC-20 allowance for the swap router; sends approve automatically if needed.
 */
export async function ensureTokenApproval(
  userId: string,
  token: Address,
  spender: Address,
  amount: bigint,
  allowedPoolIds: readonly string[],
): Promise<SubmittedTransaction | null> {
  const { walletAddress } = await resolveAgentAccount(userId);
  await assertTokenAllowed(userId, token, allowedPoolIds);

  const allowance = await getTokenAllowance(walletAddress, token, spender);
  if (allowance >= amount) {
    return null;
  }

  const approveCall = buildApprove(token, spender, amount);

  return submitAgentTransaction(userId, approveCall, "approve", {
    tokenIn: token,
    amountIn: amount,
  });
}

export type ExecuteRebalanceInput = {
  userId: string;
  plan: RebalanceSwapPlan;
  allowedPoolIds: readonly string[];
  slippageBps?: number;
  riskLimits: EffectiveRiskLimits;
};

/**
 * Execute a rebalance plan: auto-approve (if needed) + swap, fully server-side.
 */
export async function executeRebalancePlan(
  input: ExecuteRebalanceInput,
): Promise<SubmittedTransaction[]> {
  const { userId, plan, allowedPoolIds } = input;
  const slippageBps = resolveSwapSlippageBps(input.slippageBps, input.riskLimits);

  const { walletAddress } = await resolveAgentAccount(userId);
  await assertTokenAllowed(userId, plan.tokenIn, allowedPoolIds);
  await assertTokenAllowed(userId, plan.tokenOut, allowedPoolIds);
  await assertSufficientBalance(walletAddress, plan.tokenIn, plan.amountIn);

  const submitted: SubmittedTransaction[] = [];

  const approval = await ensureTokenApproval(
    userId,
    plan.tokenIn,
    plan.swap.router,
    plan.amountIn,
    allowedPoolIds,
  );
  if (approval) {
    submitted.push(approval);
  }

  const swapTx = await submitAgentTransaction(userId, plan.swap.call, "swap", {
    tokenIn: plan.tokenIn,
    tokenOut: plan.tokenOut,
    amountIn: plan.amountIn,
    amountOut: BigInt(plan.quote.amountOut),
  });
  submitted.push(swapTx);

  log.info("Rebalance executed", {
    userId,
    fromPoolId: plan.fromPoolId,
    toPoolId: plan.toPoolId,
    hops: plan.hops,
    txs: submitted.map((tx) => tx.hash),
  });

  return submitted;
}

export type ExecuteSwapExactInInput = {
  userId: string;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  allowedPoolIds: readonly string[];
  slippageBps?: number;
  riskLimits: EffectiveRiskLimits;
};

/** Auto-approve (if needed) + single-hop swap from the user's agent wallet. */
export async function executeSwapExactIn(
  input: ExecuteSwapExactInInput,
): Promise<SubmittedTransaction[]> {
  const { userId, tokenIn, tokenOut, amountIn, allowedPoolIds } = input;
  const slippageBps = resolveSwapSlippageBps(input.slippageBps, input.riskLimits);

  const { walletAddress } = await resolveAgentAccount(userId);
  await assertTokenAllowed(userId, tokenIn, allowedPoolIds);
  await assertTokenAllowed(userId, tokenOut, allowedPoolIds);
  await assertSufficientBalance(walletAddress, tokenIn, amountIn);

  const { quickSwapAdapter } = await import("../defi/quickswap/quickswap.adapter");
  const { quote, swap } = await quickSwapAdapter.buildSwapExactInWithQuote(
    tokenIn,
    tokenOut,
    amountIn,
    walletAddress,
    slippageBps,
  );

  const submitted: SubmittedTransaction[] = [];
  const approval = await ensureTokenApproval(
    userId,
    tokenIn,
    swap.router,
    amountIn,
    allowedPoolIds,
  );
  if (approval) {
    submitted.push(approval);
  }

  const swapTx = await submitAgentTransaction(userId, swap.call, "swap", {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: BigInt(quote.amountOut),
  });
  submitted.push(swapTx);

  return submitted;
}

/** Clear cached decrypted accounts (tests). */
export function resetAgentAccountCache(): void {
  accountCache.clear();
  activeSigningSession = null;
}
