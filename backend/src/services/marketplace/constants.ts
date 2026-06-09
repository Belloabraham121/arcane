import type { MarketplaceProductId } from "../../config/marketplace.js";

/** CAIP-2 network id for Somnia testnet x402 settlement. */
export const MARKETPLACE_X402_NETWORK = "eip155:50312" as const;

/** Native STT micropayment scheme (Arcane extension until facilitator supports 50312). */
export const MARKETPLACE_STT_SCHEME = "exact-native" as const;

export const MARKETPLACE_PRODUCT_DESCRIPTIONS: Record<
  MarketplaceProductId,
  { title: string; description: string }
> = {
  "pools/snapshot": {
    title: "Pool snapshot bundle",
    description:
      "Liquidity, APR, price, and drift context for the user's selected QuickSwap pools.",
  },
  "signals/spread": {
    title: "Spread / rebalance signal",
    description:
      "Latest proactive rebalance opportunity derived from portfolio drift and wallet balances.",
  },
  "signals/cross-chain": {
    title: "Cross-chain yield advisory",
    description:
      "Bridge Scout advisory payload — read-only until LI.FI cross-chain execution ships.",
  },
};
