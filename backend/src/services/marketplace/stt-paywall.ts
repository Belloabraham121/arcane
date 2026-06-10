import type { NextFunction, Request, Response } from "express";
import type { Address, Hash, PublicClient } from "viem";
import { getAddress } from "viem";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import {
  getMarketplaceEnv,
  type MarketplaceProductId,
} from "../../config/marketplace.js";
import { fail } from "../../utils/http-response.js";
import { createMarketplaceTestnetPublicClient } from "./buyer-wallet.js";
import {
  MARKETPLACE_PRODUCT_DESCRIPTIONS,
  MARKETPLACE_STT_SCHEME,
  MARKETPLACE_X402_NETWORK,
} from "./constants.js";
import { decodeNativeSttPaymentSignature } from "./stt-payment.js";

export type MarketplaceSttPayment = {
  productId: MarketplaceProductId;
  payerAddress: Address;
  amountSttWei: bigint;
  txHash: Hash | null;
  devBypass: boolean;
};

function isDevBypassEnabled(): boolean {
  return process.env.MARKETPLACE_X402_DEV_BYPASS === "true";
}

export async function verifyNativeSttPayment(input: {
  client: PublicClient;
  sellerAddress: Address;
  requiredAmountWei: bigint;
  txHash: Hash;
  payer: Address;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const receipt = await input.client.getTransactionReceipt({
    hash: input.txHash,
  });
  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction did not succeed" };
  }

  const tx = await input.client.getTransaction({ hash: input.txHash });
  if (!tx.to || getAddress(tx.to) !== getAddress(input.sellerAddress)) {
    return { ok: false, reason: "Payment recipient mismatch" };
  }
  if (getAddress(tx.from) !== getAddress(input.payer)) {
    return { ok: false, reason: "Payer address mismatch" };
  }
  if (tx.value < input.requiredAmountWei) {
    return {
      ok: false,
      reason: `Insufficient STT amount (paid ${tx.value}, need ${input.requiredAmountWei})`,
    };
  }

  return { ok: true };
}

function buildPaymentRequiredResponse(
  req: Request,
  res: Response,
  productId: MarketplaceProductId,
  priceWei: bigint,
  sellerAddress: Address,
): Response {
  const paymentRequired = {
    x402Version: 2,
    error: null,
    accepts: [
      {
        scheme: MARKETPLACE_STT_SCHEME,
        network: MARKETPLACE_X402_NETWORK,
        payTo: sellerAddress,
        amount: priceWei.toString(),
        asset: "native",
        maxTimeoutSeconds: 300,
        extra: { symbol: "STT", productId },
      },
    ],
    resource: {
      url: `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`,
      description: MARKETPLACE_PRODUCT_DESCRIPTIONS[productId].description,
      mimeType: "application/json",
    },
  };

  res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(paymentRequired));
  return res.status(402).json({
    success: false,
    data: null,
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
      payment_required: paymentRequired,
    },
    error: {
      code: "PAYMENT_REQUIRED",
      message: `Marketplace product requires ${priceWei.toString()} STT wei`,
      details: {
        productId,
        paymentAsset: "STT",
        scheme: MARKETPLACE_STT_SCHEME,
        network: MARKETPLACE_X402_NETWORK,
      },
    },
  });
}

export function createSttPaywallMiddleware(
  productId: MarketplaceProductId,
  clientFactory: () => PublicClient = createMarketplaceTestnetPublicClient,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const env = getMarketplaceEnv();
    if (!env.enabled) {
      fail(req, res, 503, {
        code: "MARKETPLACE_DISABLED",
        message: "Marketplace seller API is disabled",
      });
      return;
    }
    if (!env.sellerAddress) {
      fail(req, res, 503, {
        code: "MARKETPLACE_MISCONFIGURED",
        message: "MARKETPLACE_SELLER_ADDRESS is not configured",
      });
      return;
    }

    const priceWei = env.productPricesSttWei[productId];

    if (isDevBypassEnabled()) {
      req.marketplacePayment = {
        productId,
        payerAddress: env.sellerAddress,
        amountSttWei: priceWei,
        txHash: null,
        devBypass: true,
      };
      next();
      return;
    }

    const header =
      req.header("payment-signature") ?? req.header("PAYMENT-SIGNATURE");
    if (!header) {
      buildPaymentRequiredResponse(req, res, productId, priceWei, env.sellerAddress);
      return;
    }

    const decoded = decodeNativeSttPaymentSignature(header);
    if (!decoded) {
      fail(req, res, 402, {
        code: "INVALID_PAYMENT_SIGNATURE",
        message:
          "PAYMENT-SIGNATURE must be base64 JSON with exact-native STT tx proof",
      });
      return;
    }

    const verification = await verifyNativeSttPayment({
      client: clientFactory(),
      sellerAddress: env.sellerAddress,
      requiredAmountWei: priceWei,
      txHash: decoded.payload.txHash,
      payer: decoded.payload.payer,
    });

    if (!verification.ok) {
      fail(req, res, 402, {
        code: "PAYMENT_VERIFICATION_FAILED",
        message: verification.reason,
      });
      return;
    }

    req.marketplacePayment = {
      productId,
      payerAddress: decoded.payload.payer,
      amountSttWei: priceWei,
      txHash: decoded.payload.txHash,
      devBypass: false,
    };
    next();
  };
}
