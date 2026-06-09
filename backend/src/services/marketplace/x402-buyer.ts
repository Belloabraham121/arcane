import type { AccountMode } from "@prisma/client";
import type { Address, Hash } from "viem";
import { createLogger } from "../../shared/logger.js";
import {
  getMarketplaceEnv,
  MARKETPLACE_PRODUCT_IDS,
  resolveStrategyMarketplaceBudgetSttWei,
  type MarketplaceProductId,
} from "../../config/marketplace.js";
import { deliverMarketplaceProductForUser } from "./marketplace-delivery.service.js";
import {
  createMarketplaceBuyerWalletClient,
  createMarketplaceTestnetPublicClient,
} from "./buyer-wallet.js";
import { encodeNativeSttPaymentSignature } from "./stt-payment.js";
import type { MarketplaceSttPayment } from "./stt-paywall.js";

const log = createLogger("marketplace-buyer");

export class MarketplaceBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceBudgetError";
  }
}

export class MarketplaceProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceProductError";
  }
}

/** Tracks STT spend against the per-cycle strategy budget. */
export class MarketplaceCycleBudgetTracker {
  private spentWei = 0n;

  constructor(private readonly budgetWei: bigint) {}

  get spentSttWei(): bigint {
    return this.spentWei;
  }

  remainingSttWei(): bigint {
    return this.budgetWei > this.spentWei ? this.budgetWei - this.spentWei : 0n;
  }

  assertCanAfford(priceWei: bigint): void {
    if (priceWei > this.budgetWei) {
      throw new MarketplaceBudgetError(
        `Product price ${priceWei} wei exceeds per-cycle budget ${this.budgetWei} wei`,
      );
    }
    if (this.spentWei + priceWei > this.budgetWei) {
      throw new MarketplaceBudgetError(
        `Would exceed cycle budget (spent ${this.spentWei}, price ${priceWei}, budget ${this.budgetWei})`,
      );
    }
  }

  recordSpend(amountWei: bigint): void {
    this.assertCanAfford(amountWei);
    this.spentWei += amountWei;
  }
}

export function createMarketplaceBudgetTracker(input: {
  strategyBudgetSttWei: bigint | null | undefined;
}): MarketplaceCycleBudgetTracker {
  const budget = resolveStrategyMarketplaceBudgetSttWei(
    input.strategyBudgetSttWei,
  );
  return new MarketplaceCycleBudgetTracker(budget);
}

export function assertMarketplaceProductAllowed(
  productId: string,
): asserts productId is MarketplaceProductId {
  if (!(MARKETPLACE_PRODUCT_IDS as readonly string[]).includes(productId)) {
    throw new MarketplaceProductError(
      `Product "${productId}" is not in the Marketplace catalog whitelist`,
    );
  }
}

function isDevBypassEnabled(): boolean {
  return process.env.MARKETPLACE_X402_DEV_BYPASS === "true";
}

function marketplaceBuyerBaseUrl(): string | null {
  const explicit = process.env.MARKETPLACE_BUYER_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const port = process.env.PORT?.trim() ?? "4000";
  return `http://127.0.0.1:${port}`;
}

function internalFetchHeaders(userId: string): Record<string, string> {
  const secret = process.env.MARKETPLACE_INTERNAL_SECRET?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Marketplace-User-Id": userId,
  };
  if (secret) {
    headers["X-Marketplace-Internal-Secret"] = secret;
  }
  return headers;
}

async function sendNativeSttPayment(input: {
  userId: string;
  sellerAddress: Address;
  amountWei: bigint;
}): Promise<{ txHash: Hash; payer: Address }> {
  const { walletAddress, account, client } =
    await createMarketplaceBuyerWalletClient(input.userId);
  const txHash = await client.sendTransaction({
    account,
    to: input.sellerAddress,
    value: input.amountWei,
  });
  const publicClient = createMarketplaceTestnetPublicClient();
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, payer: walletAddress };
}

type PaymentRequiredBody = {
  meta?: {
    payment_required?: {
      accepts?: Array<{ amount?: string; payTo?: string }>;
    };
  };
};

async function fetchMarketplaceProductHttp(input: {
  userId: string;
  productId: MarketplaceProductId;
  accountMode: AccountMode;
  payment?: MarketplaceSttPayment;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const baseUrl = marketplaceBuyerBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "MARKETPLACE_BUYER_BASE_URL is not configured" };
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const path = `/api/v1/marketplace/${input.productId}`;
  const query = input.accountMode === "demo" ? "?mode=demo" : "";
  const url = `${baseUrl}${path}${query}`;
  const headers = internalFetchHeaders(input.userId);

  if (input.payment?.txHash) {
    headers["PAYMENT-SIGNATURE"] = encodeNativeSttPaymentSignature({
      txHash: input.payment.txHash,
      payer: input.payment.payerAddress,
    });
  }

  let response = await fetchFn(url, { headers });
  if (response.status === 402 && !input.payment) {
    const env = getMarketplaceEnv();
    if (!env.sellerAddress) {
      return { ok: false, error: "Marketplace seller address not configured" };
    }
    const priceWei = env.productPricesSttWei[input.productId];
    let body: PaymentRequiredBody | null = null;
    try {
      body = (await response.json()) as PaymentRequiredBody;
    } catch {
      /* ignore */
    }
    const payTo =
      body?.meta?.payment_required?.accepts?.[0]?.payTo ?? env.sellerAddress;
    const amountRaw =
      body?.meta?.payment_required?.accepts?.[0]?.amount ?? priceWei.toString();
    const amountWei = BigInt(amountRaw);

    const { txHash, payer } = await sendNativeSttPayment({
      userId: input.userId,
      sellerAddress: payTo as Address,
      amountWei,
    });

    const paymentHeader = encodeNativeSttPaymentSignature({ txHash, payer });
    response = await fetchFn(url, {
      headers: {
        ...headers,
        "PAYMENT-SIGNATURE": paymentHeader,
      },
    });
  }

  if (!response.ok) {
    let message = `Marketplace HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string };
      };
      if (errBody.error?.message) {
        message = errBody.error.message;
      }
    } catch {
      /* ignore */
    }
    return { ok: false, error: message };
  }

  const json = (await response.json()) as {
    success?: boolean;
    data?: Record<string, unknown>;
  };
  if (!json.success || !json.data) {
    return { ok: false, error: "Invalid marketplace response envelope" };
  }

  return { ok: true, data: json.data };
}

export type MarketplacePurchaseSuccess = {
  ok: true;
  skipped?: false;
  productId: MarketplaceProductId;
  amountSttWei: bigint;
  txHash: Hash | null;
  devBypass: boolean;
  data: Record<string, unknown>;
};

export type MarketplacePurchaseFailure = {
  ok: false;
  skipped?: false;
  productId: MarketplaceProductId;
  error: string;
};

export type MarketplacePurchaseSkipped = {
  ok: true;
  skipped: true;
  productId: MarketplaceProductId;
  reason: string;
};

export type MarketplacePurchaseResult =
  | MarketplacePurchaseSuccess
  | MarketplacePurchaseFailure
  | MarketplacePurchaseSkipped;

/**
 * Deduplicates product purchases within a single trading cycle
 * (e.g. risk-manager and yield-executor share pools/snapshot).
 */
export type MarketplacePurchaseBuyerContext = {
  cycleId: string;
  subAgentId: string;
  subAgentName: string;
};

export class MarketplaceCyclePurchases {
  private readonly cache = new Map<
    MarketplaceProductId,
    MarketplacePurchaseResult
  >();

  constructor(
    private readonly input: {
      userId: string;
      accountMode: AccountMode;
      budgetTracker: MarketplaceCycleBudgetTracker;
      correlationId: string;
      useHttp?: boolean;
      fetchImpl?: typeof fetch;
    },
  ) {}

  get userId(): string {
    return this.input.userId;
  }

  get correlationId(): string {
    return this.input.correlationId;
  }

  async purchase(
    productId: MarketplaceProductId,
    buyer?: MarketplacePurchaseBuyerContext,
  ): Promise<MarketplacePurchaseResult> {
    const cached = this.cache.get(productId);
    if (cached) {
      return cached;
    }

    const result = await purchaseMarketplaceProduct({
      ...this.input,
      productId,
      buyer,
    });
    if (result.ok && !result.skipped) {
      this.cache.set(productId, result);
    }
    return result;
  }
}

export async function purchaseMarketplaceProduct(input: {
  userId: string;
  productId: MarketplaceProductId;
  accountMode: AccountMode;
  budgetTracker: MarketplaceCycleBudgetTracker;
  correlationId: string;
  buyer?: MarketplacePurchaseBuyerContext;
  useHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<MarketplacePurchaseResult> {
  const env = getMarketplaceEnv();
  if (!env.enabled) {
    return {
      ok: true,
      skipped: true,
      productId: input.productId,
      reason: "marketplace_disabled",
    };
  }
  if (!env.sellerAddress) {
    return {
      ok: false,
      productId: input.productId,
      error: "MARKETPLACE_SELLER_ADDRESS is not configured",
    };
  }

  assertMarketplaceProductAllowed(input.productId);
  const priceWei = env.productPricesSttWei[input.productId];

  try {
    input.budgetTracker.assertCanAfford(priceWei);
  } catch (err) {
    return {
      ok: false,
      productId: input.productId,
      error: err instanceof Error ? err.message : "Budget exceeded",
    };
  }

  try {
    if (isDevBypassEnabled()) {
      const payment: MarketplaceSttPayment = {
        productId: input.productId,
        payerAddress: env.sellerAddress,
        amountSttWei: priceWei,
        txHash: null,
        devBypass: true,
      };
      const delivered = await deliverMarketplaceProductForUser({
        userId: input.userId,
        productId: input.productId,
        accountMode: input.accountMode,
        payment,
        correlationId: input.correlationId,
        receiptContext: input.buyer
          ? {
              cycleId: input.buyer.cycleId,
              subAgentId: input.buyer.subAgentId,
              subAgentName: input.buyer.subAgentName,
              status: "success",
            }
          : undefined,
      });
      input.budgetTracker.recordSpend(priceWei);
      return {
        ok: true,
        productId: input.productId,
        amountSttWei: priceWei,
        txHash: null,
        devBypass: true,
        data: delivered.data,
      };
    }

    if (input.useHttp) {
      const httpResult = await fetchMarketplaceProductHttp({
        userId: input.userId,
        productId: input.productId,
        accountMode: input.accountMode,
        fetchImpl: input.fetchImpl,
      });
      if (!httpResult.ok) {
        return {
          ok: false,
          productId: input.productId,
          error: httpResult.error,
        };
      }
      input.budgetTracker.recordSpend(priceWei);
      return {
        ok: true,
        productId: input.productId,
        amountSttWei: priceWei,
        txHash:
          typeof httpResult.data.payment === "object" &&
          httpResult.data.payment &&
          typeof (httpResult.data.payment as { txHash?: string }).txHash ===
            "string"
            ? ((httpResult.data.payment as { txHash: string })
                .txHash as Hash)
            : null,
        devBypass: false,
        data: httpResult.data,
      };
    }

    const { txHash, payer } = await sendNativeSttPayment({
      userId: input.userId,
      sellerAddress: env.sellerAddress,
      amountWei: priceWei,
    });

    const payment: MarketplaceSttPayment = {
      productId: input.productId,
      payerAddress: payer,
      amountSttWei: priceWei,
      txHash,
      devBypass: false,
    };

    const delivered = await deliverMarketplaceProductForUser({
      userId: input.userId,
      productId: input.productId,
      accountMode: input.accountMode,
      payment,
      correlationId: input.correlationId,
      receiptContext: input.buyer
        ? {
            cycleId: input.buyer.cycleId,
            subAgentId: input.buyer.subAgentId,
            subAgentName: input.buyer.subAgentName,
            status: "success",
          }
        : undefined,
    });

    input.budgetTracker.recordSpend(priceWei);

    return {
      ok: true,
      productId: input.productId,
      amountSttWei: priceWei,
      txHash,
      devBypass: false,
      data: delivered.data,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Marketplace purchase failed", {
      userId: input.userId,
      productId: input.productId,
      error: message,
    });
    return {
      ok: false,
      productId: input.productId,
      error: message,
    };
  }
}

/** x402-style fetch wrapper for native STT payments (HTTP seller path). */
export function createMarketplaceFetchWithSttPayment(input: {
  userId: string;
  accountMode: AccountMode;
  fetchImpl?: typeof fetch;
}): (url: string, init?: RequestInit) => Promise<Response> {
  const fetchFn = input.fetchImpl ?? fetch;
  return async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(
      internalFetchHeaders(input.userId),
    )) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }

    let response = await fetchFn(url, { ...init, headers });
    if (response.status !== 402) {
      return response;
    }

    const env = getMarketplaceEnv();
    if (!env.sellerAddress) {
      return response;
    }

    let priceWei = 0n;
    try {
      const clone = response.clone();
      const body = (await clone.json()) as PaymentRequiredBody;
      const amountRaw = body.meta?.payment_required?.accepts?.[0]?.amount;
      if (amountRaw) {
        priceWei = BigInt(amountRaw);
      }
    } catch {
      /* use env fallback below */
    }
    if (priceWei <= 0n) {
      priceWei = Object.values(env.productPricesSttWei)[0] ?? 0n;
    }

    const { txHash, payer } = await sendNativeSttPayment({
      userId: input.userId,
      sellerAddress: env.sellerAddress,
      amountWei: priceWei,
    });

    headers.set(
      "PAYMENT-SIGNATURE",
      encodeNativeSttPaymentSignature({ txHash, payer }),
    );
    return fetchFn(url, { ...init, headers });
  };
}
