/**
 * Smoke: one sub-agent-style Marketplace purchase (pools/snapshot · STT).
 *
 * Prerequisites:
 *   MARKETPLACE_ENABLED=true
 *   MARKETPLACE_SELLER_ADDRESS=0x...   # may equal the agent wallet (self-payment)
 *   MARKETPLACE_X402_DEV_BYPASS=true   # optional — skip on-chain STT locally
 *   PRIVATE_KEY=0x...                  # funds agent wallet with 30 STT when balance is 0
 *
 * Usage:
 *   npm run smoke:marketplace:purchase -- --email=you@signup-email.com
 *   npm run smoke:marketplace:purchase -- --user-id=<uuid> --mode=demo
 *   npm run smoke:marketplace:purchase -- --email=you@signup-email.com --product=signals/spread
 *
 * Manual QA (after smoke passes):
 *   1. Enable Marketplace in backend .env
 *   2. Run a trading cycle (npm run smoke:trading:cycle)
 *   3. Open agent canvas — sub-agent travels to Marketplace node
 *   4. Check live feed "Marketplace" tab for purchase line
 *   5. Confirm portfolio bar shows cycle data spend / budget left
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { AccountMode } from "@prisma/client";
import type { MarketplaceProductId } from "../src/config/marketplace.js";
import { getMarketplaceEnv, MARKETPLACE_PRODUCT_IDS } from "../src/config/marketplace.js";
import { prisma } from "../src/infrastructure/postgres/client";
import { findUserByEmail, findUserById } from "../src/services/auth/user.repository";
import { getAddress } from "viem";
import { getMarketplaceBuyerSttBalanceWei } from "../src/services/marketplace/buyer-wallet.js";
import {
  DEFAULT_SMOKE_FUND_STT_WEI,
  fundAgentWalletSttIfEmpty,
} from "../src/services/marketplace/stt-funding.js";
import {
  assertMarketplaceSttPaymentReady,
  MarketplacePaymentValidationError,
} from "../src/services/marketplace/payment-validation.js";
import {
  createMarketplaceBudgetTracker,
  purchaseMarketplaceProduct,
} from "../src/services/marketplace/x402-buyer.js";

function parseArg(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag?.slice(prefix.length + 1);
}

function parseAccountMode(): AccountMode | undefined {
  const raw = parseArg("--mode");
  if (raw === "demo" || raw === "live") {
    return raw;
  }
  if (raw) {
    throw new Error(`Invalid --mode=${raw} (use demo or live)`);
  }
  return undefined;
}

function parseProductId(): MarketplaceProductId {
  const raw = parseArg("--product") ?? "pools/snapshot";
  if (!MARKETPLACE_PRODUCT_IDS.includes(raw as MarketplaceProductId)) {
    throw new Error(
      `Invalid --product=${raw}. Use one of: ${MARKETPLACE_PRODUCT_IDS.join(", ")}`,
    );
  }
  return raw as MarketplaceProductId;
}

async function resolveUserAndMode(): Promise<{
  userId: string;
  accountMode: AccountMode;
}> {
  const modeOverride = parseAccountMode();
  const userIdArg = parseArg("--user-id");

  if (userIdArg) {
    const user = await findUserById(userIdArg);
    if (!user) {
      throw new Error(`No user for id: ${userIdArg}`);
    }
    return {
      userId: user.id,
      accountMode: modeOverride ?? user.accountMode ?? "live",
    };
  }

  const email = parseArg("--email");
  if (!email) {
    throw new Error("Pass --user-id=<uuid> or --email=<signup-email>");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error(`No user for email: ${email}`);
  }
  return {
    userId: user.id,
    accountMode: modeOverride ?? user.accountMode ?? "live",
  };
}

async function main(): Promise<void> {
  const env = getMarketplaceEnv();
  if (!env.enabled) {
    throw new Error("Set MARKETPLACE_ENABLED=true in backend/.env");
  }
  if (!env.sellerAddress) {
    throw new Error("Set MARKETPLACE_SELLER_ADDRESS in backend/.env");
  }

  const productId = parseProductId();
  const { userId, accountMode } = await resolveUserAndMode();
  const cycleId = randomUUID();

  await prisma.$connect();

  const strategy = await prisma.agentStrategy.findUnique({
    where: {
      userId_accountMode: { userId, accountMode },
    },
  });
  if (!strategy || strategy.status !== "active") {
    throw new Error(
      `No active ${accountMode} strategy for user ${userId}. Complete setup first.`,
    );
  }

  const priceWei = env.productPricesSttWei[productId];
  const devBypass = process.env.MARKETPLACE_X402_DEV_BYPASS === "true";
  const sellerAddress = env.sellerAddress!;

  if (!devBypass) {
    const fundResult = await fundAgentWalletSttIfEmpty({ userId });
    if (fundResult.funded) {
      console.log("Funded empty agent wallet with STT");
      console.log(`  agent:    ${fundResult.agentAddress}`);
      console.log(
        `  amount:   ${DEFAULT_SMOKE_FUND_STT_WEI.toString()} wei (30 STT)`,
      );
      console.log(`  tx:       ${fundResult.txHash}`);
      console.log(
        `  balance:  ${fundResult.balanceBeforeWei.toString()} → ${fundResult.balanceAfterWei.toString()} wei`,
      );
    } else {
      console.log(`STT fund skipped: ${fundResult.reason}`);
    }
  }

  const { walletAddress, balanceSttWei } =
    await getMarketplaceBuyerSttBalanceWei(userId);

  console.log("Marketplace smoke purchase");
  console.log(`  user:     ${userId}`);
  console.log(`  mode:     ${accountMode}`);
  console.log(`  product:  ${productId}`);
  console.log(`  price:    ${priceWei.toString()} STT wei`);
  console.log(`  bypass:   ${devBypass ? "dev (no on-chain tx)" : "live STT payment"}`);
  console.log(`  buyer:    ${walletAddress}`);
  console.log(`  seller:   ${sellerAddress}`);
  console.log(`  balance:  ${balanceSttWei.toString()} STT wei (Somnia testnet)`);

  const selfPayment =
    getAddress(walletAddress) === getAddress(sellerAddress);

  if (!devBypass) {
    if (selfPayment) {
      console.log(
        "  note:     seller = agent wallet (self-payment — gas STT only on-chain)",
      );
    }
    await assertMarketplaceSttPaymentReady({
      userId,
      sellerAddress,
      amountWei: priceWei,
    });
  }

  const tracker = createMarketplaceBudgetTracker({
    strategyBudgetSttWei: strategy.subAgentX402BudgetSttWei,
  });

  const result = await purchaseMarketplaceProduct({
    userId,
    productId,
    accountMode,
    budgetTracker: tracker,
    correlationId: cycleId,
    buyer: {
      cycleId,
      subAgentId: "risk-manager",
      subAgentName: "Risk Manager",
    },
  });

  if (!result.ok) {
    console.error("Purchase failed:", result.error);
    process.exit(1);
  }
  if (result.skipped) {
    console.error("Purchase skipped:", result.reason);
    process.exit(1);
  }

  console.log("Purchase OK");
  console.log(`  amount:   ${result.amountSttWei.toString()} wei`);
  console.log(`  tx:       ${result.txHash ?? "(dev bypass)"}`);
  console.log(`  keys:     ${Object.keys(result.data).join(", ") || "(empty)"}`);

  const receipt = await prisma.marketplacePurchase.findFirst({
    where: { userId, correlationId: cycleId, productId },
    orderBy: { createdAt: "desc" },
  });
  if (receipt) {
    console.log(`  receipt:  ${receipt.id} (${receipt.status})`);
  }

  console.log("\nManual QA checklist:");
  console.log("  • Agent canvas → Marketplace node + sub-agent travel on cycle");
  console.log("  • Live feed → Marketplace tab shows purchase");
  console.log("  • Portfolio bar → cycle data spend / budget left");
  console.log("  • Explorer / trading history → expandable x402 receipt");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
