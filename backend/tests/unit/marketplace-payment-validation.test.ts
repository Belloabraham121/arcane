import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { requiredSttWeiForMarketplacePayment } from "../../src/services/marketplace/payment-validation.js";

const WALLET = "0xA4B8fEC2837AE227Fd64f344ef663c5a0bA4e46e" as Address;
const OTHER = "0x1111111111111111111111111111111111111111" as Address;
const GAS = 50_000_000_000_000_000n;
const PRICE = 5_000_000_000_000_000n;

describe("requiredSttWeiForMarketplacePayment", () => {
  it("requires only gas when buyer and seller are the same address", () => {
    assert.equal(
      requiredSttWeiForMarketplacePayment({
        buyerAddress: WALLET,
        sellerAddress: WALLET,
        amountWei: PRICE,
        gasBufferWei: GAS,
      }),
      GAS,
    );
  });

  it("requires amount plus gas for cross-wallet payments", () => {
    assert.equal(
      requiredSttWeiForMarketplacePayment({
        buyerAddress: WALLET,
        sellerAddress: OTHER,
        amountWei: PRICE,
        gasBufferWei: GAS,
      }),
      PRICE + GAS,
    );
  });
});
