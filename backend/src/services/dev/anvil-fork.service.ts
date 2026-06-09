import type { Address, Hex, PublicClient } from "viem";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  pad,
  parseEther,
  parseUnits,
  formatUnits,
  publicActions,
  toHex,
  walletActions,
} from "viem";
import { getQuickSwapBundle } from "../../config/quickswap";
import { somniaMainnetChain } from "../../config/somnia-chain";
import { createLogger } from "../../shared/logger";
import { erc20MinimalAbi } from "../defi/quickswap/abis";
import { resetQuickSwapPublicClient } from "../defi/quickswap/client";

const log = createLogger("anvil-fork");

const ANVIL_HTTP_TIMEOUT_MS = 60_000;
const ANVIL_HEALTH_TIMEOUT_MS = 8_000;

export type AnvilFundTransfer = {
  token: Address;
  symbol: string;
  amount: bigint;
};

export class AnvilForkUnhealthyError extends Error {
  constructor(rpcUrl: string, cause: string) {
    super(
      [
        `Anvil fork at ${rpcUrl} is not responding (${cause}).`,
        "The fork process is usually stuck after long test runs.",
        "Restart it:",
        "  npm run fork:reset",
        "Or: Ctrl+C the anvil terminal, then npm run fork:anvil",
      ].join("\n"),
    );
    this.name = "AnvilForkUnhealthyError";
  }
}

function anvilHttpTransport(rpcUrl: string) {
  return http(rpcUrl, { timeout: ANVIL_HTTP_TIMEOUT_MS });
}

function anvilTestClient(rpcUrl: string) {
  return createTestClient({
    chain: somniaMainnetChain,
    mode: "anvil",
    transport: anvilHttpTransport(rpcUrl),
  })
    .extend(publicActions)
    .extend(walletActions);
}

function anvilPublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: somniaMainnetChain,
    transport: anvilHttpTransport(rpcUrl),
  });
}

async function anvilRawRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const json = (await res.json()) as {
      error?: { message: string };
      result?: unknown;
    };
    if (json.error) {
      throw new Error(json.error.message);
    }
    return json.result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifies Anvil can serve state-touching RPCs (stuck forks often hang here).
 * Throws {@link AnvilForkUnhealthyError} with restart instructions when unhealthy.
 */
export async function assertAnvilForkHealthy(rpcUrl: string): Promise<void> {
  try {
    await anvilRawRpc(rpcUrl, "eth_blockNumber", [], ANVIL_HEALTH_TIMEOUT_MS);
    await anvilRawRpc(
      rpcUrl,
      "eth_getBalance",
      ["0x0000000000000000000000000000000000000001", "latest"],
      ANVIL_HEALTH_TIMEOUT_MS,
    );
    await anvilRawRpc(
      rpcUrl,
      "anvil_impersonateAccount",
      ["0x0000000000000000000000000000000000000001"],
      ANVIL_HEALTH_TIMEOUT_MS,
    );
    await anvilRawRpc(
      rpcUrl,
      "anvil_stopImpersonatingAccount",
      ["0x0000000000000000000000000000000000000001"],
      ANVIL_HEALTH_TIMEOUT_MS,
    );
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new AnvilForkUnhealthyError(rpcUrl, cause);
  }
}

async function ensureNativeBalance(
  anvilRpc: string,
  address: Address,
  minWei: bigint,
): Promise<void> {
  const client = anvilPublicClient(anvilRpc);
  const current = await client.getBalance({ address });
  if (current >= minWei) {
    return;
  }
  const testClient = anvilTestClient(anvilRpc);
  await testClient.setBalance({ address, value: minWei });
}

/** Ensure the shared demo agent wallet can pay gas on the Anvil fork. */
export async function ensureDemoAgentGasFunded(
  anvilRpc: string,
  agentAddress: Address,
  minWei: bigint = parseEther("5"),
): Promise<void> {
  await assertAnvilForkHealthy(anvilRpc);
  await ensureNativeBalance(anvilRpc, agentAddress, minWei);
}

/** Impersonate an address on the fork so it can sign via JSON-RPC. */
export async function impersonateAccountOnFork(
  anvilRpc: string,
  address: Address,
): Promise<void> {
  const testClient = anvilTestClient(anvilRpc);
  await testClient.impersonateAccount({ address });
}

export async function stopImpersonatingOnFork(
  anvilRpc: string,
  address: Address,
): Promise<void> {
  const testClient = anvilTestClient(anvilRpc);
  await testClient.stopImpersonatingAccount({ address });
}

/** Point QuickSwap reads/swaps at a local Anvil fork RPC. */
export function applyQuickSwapForkRpc(anvilRpc: string): void {
  process.env.QUICKSWAP_RPC_HTTP = anvilRpc;
  if (!process.env.QUICKSWAP_TX_RECEIPT_TIMEOUT_MS) {
    process.env.QUICKSWAP_TX_RECEIPT_TIMEOUT_MS = "60000";
  }
  resetQuickSwapPublicClient();
}

/** Ensure Anvil auto-mines so agent txs confirm immediately on the fork. */
export async function ensureAnvilAutomine(anvilRpc: string): Promise<void> {
  const client = anvilPublicClient(anvilRpc);
  try {
    await client.request({
      method: "anvil_setAutomine",
      params: [true],
    });
  } catch {
    // Older Anvil builds may not expose this RPC.
  }
}

export async function mineAnvilBlock(anvilRpc: string, count = 1): Promise<void> {
  const client = anvilPublicClient(anvilRpc);
  for (let i = 0; i < count; i++) {
    await client.request({ method: "evm_mine", params: [] });
  }
}

/** Returns true when the RPC is a healthy Anvil fork. */
export async function isAnvilForkRpc(rpcUrl: string): Promise<boolean> {
  try {
    await assertAnvilForkHealthy(rpcUrl);
    return true;
  } catch {
    return false;
  }
}

export async function readErc20Balance(
  rpcUrl: string,
  token: Address,
  holder: Address,
): Promise<bigint> {
  const client = anvilPublicClient(rpcUrl);
  return client.readContract({
    address: token,
    abi: erc20MinimalAbi,
    functionName: "balanceOf",
    args: [holder],
  });
}

/**
 * Impersonate a whale on an Anvil fork and transfer ERC20 to the agent wallet.
 * Also tops up native SOMI for gas on the agent address.
 */
export async function fundAgentViaWhaleImpersonation(input: {
  anvilRpc: string;
  agentAddress: Address;
  whaleAddress: Address;
  transfers: AnvilFundTransfer[];
  nativeTopUpWei?: bigint;
}): Promise<void> {
  const testClient = anvilTestClient(input.anvilRpc);
  const nativeTopUp = input.nativeTopUpWei ?? parseEther("5");

  await ensureNativeBalance(input.anvilRpc, input.whaleAddress, nativeTopUp);
  await testClient.impersonateAccount({ address: input.whaleAddress });

  const whaleWallet = createWalletClient({
    account: { address: input.whaleAddress, type: "json-rpc" },
    chain: somniaMainnetChain,
    transport: http(input.anvilRpc),
  });

  for (const transfer of input.transfers) {
    const whaleBalance = await readErc20Balance(
      input.anvilRpc,
      transfer.token,
      input.whaleAddress,
    );
    const sendAmount =
      whaleBalance >= transfer.amount ? transfer.amount : whaleBalance;

    if (sendAmount <= 0n) {
      log.warn("Whale has no balance to transfer; will rely on anvil_deal", {
        whale: input.whaleAddress,
        token: transfer.symbol,
        needed: transfer.amount.toString(),
      });
      continue;
    }

    if (sendAmount < transfer.amount) {
      log.warn("Whale partial transfer; remainder via anvil_deal", {
        whale: input.whaleAddress,
        token: transfer.symbol,
        sent: sendAmount.toString(),
        needed: transfer.amount.toString(),
      });
    }

    const hash = await whaleWallet.writeContract({
      address: transfer.token,
      abi: erc20MinimalAbi,
      functionName: "transfer",
      args: [input.agentAddress, sendAmount],
    });

    log.info("Impersonated whale transfer", {
      whale: input.whaleAddress,
      token: transfer.symbol,
      amount: sendAmount.toString(),
      txHash: hash,
    });
  }

  await ensureNativeBalance(input.anvilRpc, input.agentAddress, nativeTopUp);

  await testClient.stopImpersonatingAccount({ address: input.whaleAddress });
}

/** Standard ERC20 `balances` mapping slot (OpenZeppelin layout). */
function erc20BalanceStorageSlot(
  holder: Address,
  mappingSlot = 0n,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [holder, mappingSlot],
    ),
  );
}

/**
 * Credit ERC20 on a fork without a whale: `anvil_deal` when available, else
 * `anvil_setStorageAt` on the balance mapping slot.
 */
export async function anvilDealErc20(
  rpcUrl: string,
  token: Address,
  account: Address,
  amount: bigint,
): Promise<void> {
  const client = anvilPublicClient(rpcUrl);
  const amountHex = pad(toHex(amount), { size: 32 });

  try {
    await client.request({
      method: "anvil_deal",
      params: [token, account, amountHex],
    });
    return;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (!detail.includes("Method not found") && !detail.includes("not available")) {
      throw err;
    }
  }

  const current = await readErc20Balance(rpcUrl, token, account).catch(
    () => 0n,
  );
  const newBalance = current + amount;
  const slot = erc20BalanceStorageSlot(account);

  await client.request({
    method: "anvil_setStorageAt",
    params: [token, slot, pad(toHex(newBalance), { size: 32 })],
  });
}

/** Cap fork fund scale so whale impersonation works with realistic on-fork balances. */
const FORK_FUND_SCALE_CAP = 200n;

/** Default portfolio for fork tests (scaled by deposit, capped for local Anvil). */
export function defaultForkTransfers(
  depositAmount: number,
): AnvilFundTransfer[] {
  const bundle = getQuickSwapBundle(5031);
  const usdce = bundle.tokens.find((t) => t.symbol === "USDCe");
  const wsomi = bundle.tokens.find((t) => t.symbol === "WSOMI");
  const weth = bundle.tokens.find((t) => t.symbol === "WETH");
  if (!usdce || !wsomi) {
    throw new Error("QuickSwap mainnet token bundle missing USDCe/WSOMI");
  }

  const rawScale = BigInt(Math.max(Math.floor(depositAmount / 100), 1));
  const scale =
    rawScale > FORK_FUND_SCALE_CAP ? FORK_FUND_SCALE_CAP : rawScale;

  const transfers: AnvilFundTransfer[] = [
    {
      token: usdce.address,
      symbol: "USDCe",
      amount: 10_000_000n * scale,
    },
    {
      token: wsomi.address,
      symbol: "WSOMI",
      amount: 10n ** 19n * scale,
    },
  ];

  if (weth) {
    transfers.push({
      token: weth.address,
      symbol: "WETH",
      amount: 10n ** 19n * scale,
    });
  }

  return transfers;
}

/**
 * Fund agent on fork: prefer whale impersonation; fall back to anvil_deal per token.
 */
export async function fundAgentOnFork(input: {
  anvilRpc: string;
  agentAddress: Address;
  depositAmount: number;
  whaleAddress?: Address;
}): Promise<{ method: "impersonation" | "anvil_deal"; whaleAddress?: Address }> {
  await assertAnvilForkHealthy(input.anvilRpc);

  const transfers = defaultForkTransfers(input.depositAmount);
  const gasTopUp = parseEther("5");

  await ensureNativeBalance(input.anvilRpc, input.agentAddress, gasTopUp);

  if (input.whaleAddress) {
    await fundAgentViaWhaleImpersonation({
      anvilRpc: input.anvilRpc,
      agentAddress: input.agentAddress,
      whaleAddress: input.whaleAddress,
      transfers,
    });

    for (const transfer of transfers) {
      const balance = await readErc20Balance(
        input.anvilRpc,
        transfer.token,
        input.agentAddress,
      );
      if (balance >= transfer.amount) {
        continue;
      }
      const shortfall = transfer.amount - balance;
      try {
        await anvilDealErc20(
          input.anvilRpc,
          transfer.token,
          input.agentAddress,
          shortfall,
        );
        log.info("Fork cheat topped up after impersonation", {
          token: transfer.symbol,
          shortfall: shortfall.toString(),
        });
      } catch (err) {
        log.warn("Could not top up token after impersonation; continuing", {
          token: transfer.symbol,
          shortfall: shortfall.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { method: "impersonation", whaleAddress: input.whaleAddress };
  }

  for (const transfer of transfers) {
    try {
      await anvilDealErc20(
        input.anvilRpc,
        transfer.token,
        input.agentAddress,
        transfer.amount,
      );
      log.info("anvil_deal credited token", {
        token: transfer.symbol,
        amount: transfer.amount.toString(),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `anvil_deal failed for ${transfer.symbol} — pass --whale=0x... with a token-rich address. ${detail}`,
      );
    }
  }

  return { method: "anvil_deal" };
}

/** Scan candidate addresses for the first with sufficient USDCe (fork state). */
export async function findWhaleCandidate(
  rpcUrl: string,
  candidates: Address[],
  minUsdceRaw: bigint,
): Promise<Address | null> {
  const usdce = getQuickSwapBundle(5031).tokens.find((t) => t.symbol === "USDCe");
  if (!usdce) {
    return null;
  }

  for (const candidate of candidates) {
    try {
      const balance = await readErc20Balance(rpcUrl, usdce.address, candidate);
      if (balance >= minUsdceRaw) {
        return candidate;
      }
    } catch {
      // skip invalid
    }
  }
  return null;
}

export const DEMO_DEPOSIT_SYMBOLS = ["USDCe", "WSOMI", "WETH", "SOMI"] as const;

export type DemoDepositSymbol = (typeof DEMO_DEPOSIT_SYMBOLS)[number];

async function setErc20BalanceOnFork(
  rpcUrl: string,
  token: Address,
  account: Address,
  newBalance: bigint,
): Promise<void> {
  const client = anvilPublicClient(rpcUrl);
  const slot = erc20BalanceStorageSlot(account);

  await client.request({
    method: "anvil_setStorageAt",
    params: [token, slot, pad(toHex(newBalance), { size: 32 })],
  });
}

/** Add ERC20 tokens to a fork wallet (credits on top of existing balance). */
export async function creditErc20OnFork(
  rpcUrl: string,
  token: Address,
  account: Address,
  creditAmount: bigint,
): Promise<bigint> {
  if (creditAmount <= 0n) {
    throw new Error("Credit amount must be positive");
  }

  const current = await readErc20Balance(rpcUrl, token, account).catch(
    () => 0n,
  );
  const newBalance = current + creditAmount;

  try {
    await anvilPublicClient(rpcUrl).request({
      method: "anvil_deal",
      params: [token, account, pad(toHex(newBalance), { size: 32 })],
    });
  } catch {
    await setErc20BalanceOnFork(rpcUrl, token, account, newBalance);
  }

  return newBalance;
}

/** Add native SOMI to a fork wallet. */
export async function creditNativeOnFork(
  rpcUrl: string,
  account: Address,
  creditWei: bigint,
): Promise<bigint> {
  if (creditWei <= 0n) {
    throw new Error("Credit amount must be positive");
  }

  const client = anvilPublicClient(rpcUrl);
  const testClient = anvilTestClient(rpcUrl);
  const current = await client.getBalance({ address: account });
  const newBalance = current + creditWei;
  await testClient.setBalance({ address: account, value: newBalance });
  return newBalance;
}

export async function creditDemoWalletToken(input: {
  anvilRpc: string;
  walletAddress: Address;
  symbol: DemoDepositSymbol;
  amount: string;
}): Promise<{ symbol: string; credited: string; formattedBalance: string }> {
  await assertAnvilForkHealthy(input.anvilRpc);
  await mineAnvilBlock(input.anvilRpc, 1);

  const amount = input.amount.trim();
  if (!amount || Number(amount) <= 0 || !Number.isFinite(Number(amount))) {
    throw new Error("Enter a positive token amount");
  }

  if (input.symbol === "SOMI") {
    const creditWei = parseEther(amount);
    const newBalance = await creditNativeOnFork(
      input.anvilRpc,
      input.walletAddress,
      creditWei,
    );
    return {
      symbol: "SOMI",
      credited: amount,
      formattedBalance: formatUnits(newBalance, 18),
    };
  }

  const bundle = getQuickSwapBundle(5031);
  const token = bundle.tokens.find((row) => row.symbol === input.symbol);
  if (!token) {
    throw new Error(`Unsupported demo deposit token: ${input.symbol}`);
  }

  const creditRaw = parseUnits(amount, token.decimals);
  const newBalance = await creditErc20OnFork(
    input.anvilRpc,
    token.address,
    input.walletAddress,
    creditRaw,
  );

  await ensureDemoAgentGasFunded(input.anvilRpc, input.walletAddress);

  return {
    symbol: input.symbol,
    credited: amount,
    formattedBalance: formatUnits(newBalance, token.decimals),
  };
}
