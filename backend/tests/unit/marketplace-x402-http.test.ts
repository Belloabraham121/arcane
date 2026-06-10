import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Address, Hash } from "viem";
import {
  createMarketplaceBudgetTracker,
  purchaseMarketplaceProduct,
} from "../../src/services/marketplace/x402-buyer.js";
import { encodeNativeSttPaymentSignature } from "../../src/services/marketplace/stt-payment.js";

const originalEnv = { ...process.env };

const SELLER = "0x1111111111111111111111111111111111111111" as Address;
const PAYER = "0x2222222222222222222222222222222222222222" as Address;
const TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hash;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("purchaseMarketplaceProduct HTTP x402 flow", () => {
  it("retries with PAYMENT-SIGNATURE after 402 Payment Required", async () => {
    process.env.MARKETPLACE_ENABLED = "true";
    process.env.MARKETPLACE_SELLER_ADDRESS = SELLER;
    delete process.env.MARKETPLACE_X402_DEV_BYPASS;

    const requests: Array<{ hasPayment: boolean }> = [];

    const fetchImpl = async (
      _url: string,
      init?: { headers?: Record<string, string> },
    ): Promise<Response> => {
      const paymentHeader =
        init?.headers?.["PAYMENT-SIGNATURE"] ??
        init?.headers?.["payment-signature"];
      requests.push({ hasPayment: Boolean(paymentHeader) });

      if (!paymentHeader) {
        return new Response(
          JSON.stringify({
            success: false,
            data: null,
            meta: {
              payment_required: {
                accepts: [
                  {
                    scheme: "exact-native",
                    amount: "5000000000000000",
                    payTo: SELLER,
                  },
                ],
              },
            },
            error: { code: "PAYMENT_REQUIRED", message: "STT required" },
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            productId: "pools/snapshot",
            pools: [{ id: "pool-1" }],
            payment: { txHash: TX_HASH, amountSttWei: "5000000000000000" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const tracker = createMarketplaceBudgetTracker({
      strategyBudgetSttWei: null,
    });

    const result = await purchaseMarketplaceProduct({
      userId: "user-http-test",
      productId: "pools/snapshot",
      accountMode: "demo",
      budgetTracker: tracker,
      correlationId: "cycle-http-test",
      useHttp: true,
      fetchImpl: fetchImpl as typeof fetch,
      paymentSender: async () => ({ txHash: TX_HASH, payer: PAYER }),
    });

    assert.equal(result.ok, true);
    if (!result.ok || result.skipped) {
      assert.fail("expected successful purchase");
    }
    assert.equal(result.productId, "pools/snapshot");
    assert.equal(result.amountSttWei, 5_000_000_000_000_000n);
    assert.equal(result.txHash, TX_HASH);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.hasPayment, false);
    assert.equal(requests[1]?.hasPayment, true);
    assert.equal(
      encodeNativeSttPaymentSignature({ txHash: TX_HASH, payer: PAYER }).length >
        0,
      true,
    );
  });
});
