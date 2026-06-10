import { apiRequest } from "@/lib/api/client"
import type { MarketplaceProductPricesSttWei, MarketplaceSummary } from "@/lib/api/strategy-types"

export type MarketplacePurchaseRecord = {
  id: string
  cycleId: string | null
  subAgentId: string | null
  productId: string
  amountSttWei: string
  txHash: string | null
  payerAddress: string
  correlationId: string
  status: "success" | "failed" | "skipped"
  metadata: unknown
  createdAt: string
}

export type MarketplaceCatalogProduct = {
  id: keyof MarketplaceProductPricesSttWei
  title: string
  description: string
  priceSttWei: string
  paymentAsset: "STT"
  path: string
}

export type MarketplaceCatalog = {
  enabled: boolean
  paymentAsset: "STT"
  sellerAddress: string | null
  products: MarketplaceCatalogProduct[]
}

const DEFAULT_BUDGET_STT_WEI = "100000000000000000"

export function marketplaceSummaryFromCatalog(
  catalog: MarketplaceCatalog,
): MarketplaceSummary {
  const productPricesSttWei = Object.fromEntries(
    catalog.products.map((product) => [product.id, product.priceSttWei]),
  ) as MarketplaceProductPricesSttWei

  return {
    enabled: catalog.enabled,
    paymentAsset: "STT",
    facilitatorUrl: "",
    sellerAddress: catalog.sellerAddress,
    chainId: 50312,
    budgetSttWei: DEFAULT_BUDGET_STT_WEI,
    spendSttWei: "0",
    remainingSttWei: DEFAULT_BUDGET_STT_WEI,
    productPricesSttWei,
  }
}

export async function fetchMarketplaceCatalog() {
  return apiRequest<MarketplaceCatalog>("/api/v1/marketplace/catalog")
}

export async function fetchMarketplacePurchases(limit = 50) {
  return apiRequest<{ purchases: MarketplacePurchaseRecord[] }>(
    `/api/v1/marketplace/purchases?limit=${limit}`,
  )
}
