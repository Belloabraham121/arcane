import type { Address } from "viem";
import {
  getMarketplaceEnv,
  resolveStrategyMarketplaceBudgetSttWei,
  type MarketplaceProductId,
} from "../../config/marketplace.js";
import type { SubAgentConfigItem } from "../agents/strategy.types.js";
import {
  getMarketplaceBuyerSttBalanceWei,
  SOMNIA_TESTNET_FAUCET_URL,
} from "./buyer-wallet.js";
import {
  enabledSubAgentsForMarketplace,
  marketplaceProductForSubAgent,
} from "./sub-agent-products.js";

function parseGasBufferSttWei(): bigint {
  const raw = process.env.MARKETPLACE_X402_GAS_BUFFER_STT_WEI?.trim();
  if (!raw) {
    return 50_000_000_000_000_000n; // 0.05 STT
  }
  return BigInt(raw);
}

export class MarketplacePreflightError extends Error {
  constructor(
    message: string,
    readonly code: "INSUFFICIENT_STT" | "MARKETPLACE_WALLET_ERROR",
    readonly details: {
      walletAddress: Address;
      balanceSttWei: bigint;
      requiredSttWei: bigint;
      estimatedSpendSttWei: bigint;
      faucetUrl: string;
    },
  ) {
    super(message);
    this.name = "MarketplacePreflightError";
  }
}

export type MarketplacePreflightSkippedReason =
  | "marketplace_disabled"
  | "no_marketplace_sub_agents";

export type MarketplacePreflightSuccess = {
  ok: true;
  skipped: boolean;
  skippedReason?: MarketplacePreflightSkippedReason;
  walletAddress?: Address;
  balanceSttWei?: bigint;
  requiredSttWei?: bigint;
  estimatedSpendSttWei?: bigint;
  gasBufferSttWei?: bigint;
};

export type MarketplacePreflightFailure = {
  ok: false;
  code: "INSUFFICIENT_STT";
  walletAddress: Address;
  balanceSttWei: bigint;
  requiredSttWei: bigint;
  estimatedSpendSttWei: bigint;
  gasBufferSttWei: bigint;
  message: string;
  faucetUrl: string;
};

export type MarketplacePreflightResult =
  | MarketplacePreflightSuccess
  | MarketplacePreflightFailure;

export function estimateMarketplaceCycleSpendSttWei(
  subAgents: SubAgentConfigItem[],
  budgetSttWei: bigint,
): bigint {
  const env = getMarketplaceEnv();
  const buyers = enabledSubAgentsForMarketplace(subAgents);
  if (buyers.length === 0) {
    return 0n;
  }

  const productTotals = new Map<MarketplaceProductId, bigint>();
  for (const agent of buyers) {
    const productId = marketplaceProductForSubAgent(agent.id);
    if (!productId) continue;
    const price = env.productPricesSttWei[productId];
    productTotals.set(productId, price);
  }

  let sum = 0n;
  for (const price of productTotals.values()) {
    sum += price;
  }

  return sum > budgetSttWei ? budgetSttWei : sum;
}

export function formatInsufficientSttMessage(input: {
  walletAddress: Address;
  balanceSttWei: bigint;
  requiredSttWei: bigint;
}): string {
  return (
    `Agent wallet ${input.walletAddress} has insufficient STT on Somnia testnet ` +
    `(balance ${input.balanceSttWei} wei, need ${input.requiredSttWei} wei for Marketplace x402). ` +
    `Fund STT via the testnet faucet: ${SOMNIA_TESTNET_FAUCET_URL}`
  );
}

/**
 * Pre-flight before sub-agent Marketplace buy phase.
 * Skips when marketplace is disabled or no sub-agents map to products.
 */
export async function runMarketplaceSttPreflight(input: {
  userId: string;
  subAgents: SubAgentConfigItem[];
  strategyBudgetSttWei: bigint | null | undefined;
}): Promise<MarketplacePreflightResult> {
  const env = getMarketplaceEnv();
  if (!env.enabled) {
    return { ok: true, skipped: true, skippedReason: "marketplace_disabled" };
  }

  const buyers = enabledSubAgentsForMarketplace(input.subAgents);
  if (buyers.length === 0) {
    return { ok: true, skipped: true, skippedReason: "no_marketplace_sub_agents" };
  }

  const budgetSttWei = resolveStrategyMarketplaceBudgetSttWei(
    input.strategyBudgetSttWei,
  );
  const estimatedSpendSttWei = estimateMarketplaceCycleSpendSttWei(
    input.subAgents,
    budgetSttWei,
  );
  const gasBufferSttWei = parseGasBufferSttWei();
  const requiredSttWei = estimatedSpendSttWei + gasBufferSttWei;

  const { walletAddress, balanceSttWei } =
    await getMarketplaceBuyerSttBalanceWei(input.userId);

  if (balanceSttWei < requiredSttWei) {
    return {
      ok: false,
      code: "INSUFFICIENT_STT",
      walletAddress,
      balanceSttWei,
      requiredSttWei,
      estimatedSpendSttWei,
      gasBufferSttWei,
      message: formatInsufficientSttMessage({
        walletAddress,
        balanceSttWei,
        requiredSttWei,
      }),
      faucetUrl: SOMNIA_TESTNET_FAUCET_URL,
    };
  }

  return {
    ok: true,
    skipped: false,
    walletAddress,
    balanceSttWei,
    requiredSttWei,
    estimatedSpendSttWei,
    gasBufferSttWei,
  };
}

/** Throws MarketplacePreflightError when STT balance is too low. */
export async function assertMarketplaceSttPreflight(input: {
  userId: string;
  subAgents: SubAgentConfigItem[];
  strategyBudgetSttWei: bigint | null | undefined;
}): Promise<MarketplacePreflightSuccess> {
  const result = await runMarketplaceSttPreflight(input);
  if (result.ok) {
    return result;
  }

  throw new MarketplacePreflightError(result.message, result.code, {
    walletAddress: result.walletAddress,
    balanceSttWei: result.balanceSttWei,
    requiredSttWei: result.requiredSttWei,
    estimatedSpendSttWei: result.estimatedSpendSttWei,
    faucetUrl: result.faucetUrl,
  });
}
