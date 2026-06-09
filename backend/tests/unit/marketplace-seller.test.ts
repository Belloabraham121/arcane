import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Address, Hash, PublicClient } from "viem";
import { buildMarketplaceCatalog } from "../../src/services/marketplace/catalog.js";
import {
  createSttPaywallMiddleware,
  verifyNativeSttPayment,
} from "../../src/services/marketplace/stt-paywall.js";
import { MARKETPLACE_STT_SCHEME, MARKETPLACE_X402_NETWORK } from "../../src/services/marketplace/constants.js";
import { encodeNativeSttPaymentSignature } from "../../src/services/marketplace/stt-payment.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("buildMarketplaceCatalog", () => {
  it("lists all v1 products with STT wei prices", () => {
    delete process.env.MARKETPLACE_ENABLED;
    const catalog = buildMarketplaceCatalog();
    assert.equal(catalog.paymentAsset, "STT");
    assert.equal(catalog.products.length, 3);
    assert.equal(catalog.products[0]?.scheme, MARKETPLACE_STT_SCHEME);
    assert.equal(catalog.products[0]?.network, MARKETPLACE_X402_NETWORK);
    assert.match(catalog.products[1]?.path ?? "", /signals\/spread/);
  });
});

describe("verifyNativeSttPayment", () => {
  it("accepts a valid native STT transfer", async () => {
    const seller = "0x1111111111111111111111111111111111111111" as Address;
    const payer = "0x2222222222222222222222222222222222222222" as Address;
    const txHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hash;

    const client = {
      async getTransactionReceipt() {
        return { status: "success" };
      },
      async getTransaction() {
        return {
          from: payer,
          to: seller,
          value: 5_000_000_000_000_000n,
        };
      },
    } as unknown as PublicClient;

    const result = await verifyNativeSttPayment({
      client,
      sellerAddress: seller,
      requiredAmountWei: 5_000_000_000_000_000n,
      txHash,
      payer,
    });

    assert.equal(result.ok, true);
  });

  it("rejects insufficient STT value", async () => {
    const seller = "0x1111111111111111111111111111111111111111" as Address;
    const payer = "0x2222222222222222222222222222222222222222" as Address;
    const txHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hash;

    const client = {
      async getTransactionReceipt() {
        return { status: "success" };
      },
      async getTransaction() {
        return {
          from: payer,
          to: seller,
          value: 1n,
        };
      },
    } as unknown as PublicClient;

    const result = await verifyNativeSttPayment({
      client,
      sellerAddress: seller,
      requiredAmountWei: 5_000_000_000_000_000n,
      txHash,
      payer,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /Insufficient STT/);
    }
  });
});

describe("createSttPaywallMiddleware", () => {
  it("returns 402 when marketplace is enabled and payment is missing", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS =
      "0x3333333333333333333333333333333333333333";
    delete process.env.MARKETPLACE_X402_DEV_BYPASS;

    const middleware = createSttPaywallMiddleware("signals/spread");
    const req = {
      correlationId: "corr-1",
      protocol: "http",
      get: (name: string) => (name === "host" ? "localhost:4000" : undefined),
      header: () => undefined,
      originalUrl: "/api/v1/marketplace/signals/spread",
    };
    let status = 0;
    let body: Record<string, unknown> | null = null;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(payload: Record<string, unknown>) {
        body = payload;
        return this;
      },
    };
    let nextCalled = false;

    await middleware(req as never, res as never, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(status, 402);
    assert.equal(body?.success, false);
    assert.equal(
      (body?.error as { code?: string } | undefined)?.code,
      "PAYMENT_REQUIRED",
    );
  });

  it("bypasses payment when MARKETPLACE_X402_DEV_BYPASS=true", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS =
      "0x3333333333333333333333333333333333333333";
    process.env.MARKETPLACE_X402_DEV_BYPASS = "true";

    const middleware = createSttPaywallMiddleware("signals/spread");
    const req = {
      correlationId: "corr-2",
      protocol: "http",
      get: () => "localhost:4000",
      header: () => undefined,
      originalUrl: "/api/v1/marketplace/signals/spread",
    };
    const res = {
      status() {
        return this;
      },
      setHeader() {
        return this;
      },
      json() {
        return this;
      },
    };
    let payment: unknown;
    await middleware(req as never, res as never, () => {
      payment = (req as { marketplacePayment?: unknown }).marketplacePayment;
    });

    assert.equal((payment as { devBypass?: boolean })?.devBypass, true);
  });

  it("accepts request after valid PAYMENT-SIGNATURE (402 → pay → 200 path)", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS =
      "0x3333333333333333333333333333333333333333";
    delete process.env.MARKETPLACE_X402_DEV_BYPASS;

    const seller = "0x3333333333333333333333333333333333333333" as Address;
    const payer = "0x4444444444444444444444444444444444444444" as Address;
    const txHash =
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hash;

    const mockClient = {
      async getTransactionReceipt() {
        return { status: "success" };
      },
      async getTransaction() {
        return {
          from: payer,
          to: seller,
          value: 3_000_000_000_000_000n,
        };
      },
    };

    const middleware = createSttPaywallMiddleware(
      "signals/spread",
      () => mockClient as never,
    );

    const paymentHeader = encodeNativeSttPaymentSignature({ txHash, payer });
    const req = {
      correlationId: "corr-pay-1",
      protocol: "http",
      get: () => "localhost:4000",
      header: (name: string) =>
        name.toLowerCase() === "payment-signature" ? paymentHeader : undefined,
      originalUrl: "/api/v1/marketplace/signals/spread",
    };
    const res = {
      status() {
        return this;
      },
      setHeader() {
        return this;
      },
      json() {
        return this;
      },
    };
    let nextCalled = false;
    let payment: unknown;

    await middleware(req as never, res as never, () => {
      nextCalled = true;
      payment = (req as { marketplacePayment?: unknown }).marketplacePayment;
    });

    assert.equal(nextCalled, true);
    assert.equal((payment as { txHash?: string })?.txHash, txHash);
    assert.equal((payment as { devBypass?: boolean })?.devBypass, false);
  });
});
