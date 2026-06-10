import { getAddress, type Address } from "viem";

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

/** Strip whitespace and accidental literal `\\n` from .env address values. */
export function parseMarketplaceAddressEnv(
  raw: string | undefined,
  envName = "MARKETPLACE_SELLER_ADDRESS",
): Address | null {
  if (raw == null) {
    return null;
  }
  const cleaned = raw
    .trim()
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\r?\n/g, "");
  if (cleaned.length === 0) {
    return null;
  }
  try {
    return getAddress(cleaned);
  } catch {
    throw new Error(
      `${envName} must be a valid EVM address. Got "${raw}"`,
    );
  }
}

function parseWeiEnv(name: string, fallback: string): bigint {
  const raw = optional(name, fallback).trim();
  try {
    const value = BigInt(raw);
    if (value < 0n) {
      throw new Error("negative");
    }
    return value;
  } catch {
    throw new Error(
      `${name} must be a non-negative integer string (STT wei). Got "${raw}"`,
    );
  }
}

/** Marketplace data products (v1). Prices are always in native STT wei. */
export const MARKETPLACE_PRODUCT_IDS = [
  "pools/snapshot",
  "signals/spread",
  "signals/cross-chain",
] as const;

export type MarketplaceProductId = (typeof MARKETPLACE_PRODUCT_IDS)[number];

export type MarketplaceProductPricesSttWei = Record<MarketplaceProductId, string>;

export type MarketplaceEnv = {
  enabled: boolean;
  sellerAddress: Address | null;
  facilitatorUrl: string;
  /** Somnia native testnet token only — never USDC/USDT. */
  paymentAsset: "STT";
  chainId: number;
  productPricesSttWei: Record<MarketplaceProductId, bigint>;
  /** Default per-cycle x402 budget when strategy has no override. */
  defaultSubAgentX402BudgetSttWei: bigint;
};

export type MarketplaceSummary = {
  enabled: boolean;
  paymentAsset: "STT";
  facilitatorUrl: string;
  sellerAddress: string | null;
  chainId: number;
  budgetSttWei: string;
  spendSttWei: string;
  remainingSttWei: string;
  productPricesSttWei: Record<MarketplaceProductId, string>;
};

const STABLECOIN_BLOCKLIST = new Set(["USDC", "USDT", "USDCE", "STGUSDT"]);

function assertSttOnlyPaymentAsset(): void {
  const asset = optional("MARKETPLACE_PAYMENT_ASSET", "STT").trim().toUpperCase();
  if (STABLECOIN_BLOCKLIST.has(asset) || asset !== "STT") {
    throw new Error(
      `MARKETPLACE_PAYMENT_ASSET must be STT (Somnia native testnet token). ` +
        `Got "${asset}". USDC and USDT settlement paths are not supported.`,
    );
  }

  if (
    optional("MARKETPLACE_PAYMENT_USDC", "false") === "true" ||
    optional("MARKETPLACE_PAYMENT_USDT", "false") === "true"
  ) {
    throw new Error(
      "Marketplace does not support USDC/USDT payment paths. Use STT wei only.",
    );
  }
}

/** Lazy — validates STT-only policy when marketplace features are used. */
export function getMarketplaceEnv(): MarketplaceEnv {
  assertSttOnlyPaymentAsset();

  const enabled = optional("MARKETPLACE_ENABLED", "false") === "true";
  const sellerAddress = parseMarketplaceAddressEnv(
    process.env.MARKETPLACE_SELLER_ADDRESS,
  );

  if (enabled && !sellerAddress) {
    throw new Error(
      "MARKETPLACE_SELLER_ADDRESS is required when MARKETPLACE_ENABLED=true",
    );
  }

  const productPricesSttWei: Record<MarketplaceProductId, bigint> = {
    "pools/snapshot": parseWeiEnv(
      "MARKETPLACE_PRICE_POOLS_SNAPSHOT_STT_WEI",
      "5000000000000000",
    ),
    "signals/spread": parseWeiEnv(
      "MARKETPLACE_PRICE_SIGNALS_SPREAD_STT_WEI",
      "3000000000000000",
    ),
    "signals/cross-chain": parseWeiEnv(
      "MARKETPLACE_PRICE_SIGNALS_CROSS_CHAIN_STT_WEI",
      "5000000000000000",
    ),
  };

  return {
    enabled,
    sellerAddress,
    facilitatorUrl: optional(
      "X402_FACILITATOR_URL",
      "https://facilitator.cdp.coinbase.com",
    ),
    paymentAsset: "STT",
    chainId: Number(optional("SOMNIA_CHAIN_ID", "50312")),
    productPricesSttWei,
    defaultSubAgentX402BudgetSttWei: parseWeiEnv(
      "SUB_AGENT_X402_BUDGET_STT_WEI_DEFAULT",
      "100000000000000000",
    ),
  };
}

export function resolveStrategyMarketplaceBudgetSttWei(
  strategyBudgetWei: bigint | null | undefined,
): bigint {
  const env = getMarketplaceEnv();
  return strategyBudgetWei ?? env.defaultSubAgentX402BudgetSttWei;
}

export function buildMarketplaceSummary(input: {
  strategyBudgetSttWei: bigint | null;
  spendSttWei?: bigint;
}): MarketplaceSummary {
  const env = getMarketplaceEnv();
  const budget = resolveStrategyMarketplaceBudgetSttWei(
    input.strategyBudgetSttWei,
  );
  const spend = input.spendSttWei ?? 0n;
  const remaining = budget > spend ? budget - spend : 0n;

  const productPricesSttWei = Object.fromEntries(
    MARKETPLACE_PRODUCT_IDS.map((id) => [
      id,
      env.productPricesSttWei[id].toString(),
    ]),
  ) as Record<MarketplaceProductId, string>;

  return {
    enabled: env.enabled,
    paymentAsset: "STT",
    facilitatorUrl: env.facilitatorUrl,
    sellerAddress: env.sellerAddress,
    chainId: env.chainId,
    budgetSttWei: budget.toString(),
    spendSttWei: spend.toString(),
    remainingSttWei: remaining.toString(),
    productPricesSttWei,
  };
}

export function parseSubAgentX402BudgetSttWei(
  input: unknown,
): bigint | null | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (typeof input === "bigint") {
    if (input < 0n) {
      throw new Error("subAgentX402BudgetSttWei must be non-negative");
    }
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0 || !Number.isInteger(input)) {
      throw new Error("subAgentX402BudgetSttWei must be a non-negative integer");
    }
    return BigInt(input);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(
        "subAgentX402BudgetSttWei must be a decimal string of STT wei",
      );
    }
    return BigInt(trimmed);
  }
  throw new Error("subAgentX402BudgetSttWei must be a string, number, or null");
}
