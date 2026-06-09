import {
  getMarketplaceEnv,
  MARKETPLACE_PRODUCT_IDS,
  type MarketplaceProductId,
} from "../../config/marketplace.js";
import {
  MARKETPLACE_PRODUCT_DESCRIPTIONS,
  MARKETPLACE_STT_SCHEME,
  MARKETPLACE_X402_NETWORK,
} from "./constants.js";

export type MarketplaceCatalogProduct = {
  id: MarketplaceProductId;
  title: string;
  description: string;
  priceSttWei: string;
  paymentAsset: "STT";
  scheme: typeof MARKETPLACE_STT_SCHEME;
  network: typeof MARKETPLACE_X402_NETWORK;
  path: string;
};

export type MarketplaceCatalog = {
  enabled: boolean;
  paymentAsset: "STT";
  network: typeof MARKETPLACE_X402_NETWORK;
  sellerAddress: string | null;
  products: MarketplaceCatalogProduct[];
};

function productPath(id: MarketplaceProductId): string {
  return `/api/v1/marketplace/${id}`;
}

export function buildMarketplaceCatalog(): MarketplaceCatalog {
  const env = getMarketplaceEnv();

  const products: MarketplaceCatalogProduct[] = MARKETPLACE_PRODUCT_IDS.map(
    (id) => ({
      id,
      title: MARKETPLACE_PRODUCT_DESCRIPTIONS[id].title,
      description: MARKETPLACE_PRODUCT_DESCRIPTIONS[id].description,
      priceSttWei: env.productPricesSttWei[id].toString(),
      paymentAsset: "STT",
      scheme: MARKETPLACE_STT_SCHEME,
      network: MARKETPLACE_X402_NETWORK,
      path: productPath(id),
    }),
  );

  return {
    enabled: env.enabled,
    paymentAsset: "STT",
    network: MARKETPLACE_X402_NETWORK,
    sellerAddress: env.sellerAddress,
    products,
  };
}
