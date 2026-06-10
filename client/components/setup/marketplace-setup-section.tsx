import type { AccountMode } from "@/lib/api/auth"
import type { MarketplaceSummary } from "@/lib/api/strategy-types"
import {
  formatSttWei,
  marketplaceProductLabel,
  weiToSttInput,
} from "@/lib/marketplace-display"

type MarketplaceSetupSectionProps = {
  accountMode: AccountMode
  marketplace: MarketplaceSummary | null
  budgetSttInput: string
  onBudgetSttInputChange: (value: string) => void
}

export function MarketplaceSetupSection({
  accountMode,
  marketplace,
  budgetSttInput,
  onBudgetSttInputChange,
}: MarketplaceSetupSectionProps) {
  const isDemo = accountMode === "demo"

  if (!marketplace?.enabled) {
    return (
      <div className="border border-border p-6">
        <p className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Marketplace data (x402)
        </p>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          The Arcane Marketplace is not enabled on this server. Sub-agents will
          use free inline pool context only.
        </p>
      </div>
    )
  }

  const budgetReadOnly = isDemo

  return (
    <div className="space-y-4 border border-border p-6">
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Marketplace data (x402 · STT)
        </p>
        <p className="max-w-3xl font-mono text-xs leading-relaxed text-muted-foreground">
          Sub-agents can buy enriched data from the central Marketplace before
          each trading cycle. Payments settle in{" "}
          <span className="text-foreground">Somnia native testnet token (STT)</span>
          {" "}— not USDC or USDT. Toggle per sub-agent below when a data product
          is available.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="marketplace-budget-stt"
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
          >
            Per-cycle STT budget
          </label>
          <div className="flex items-center gap-2">
            <input
              id="marketplace-budget-stt"
              type="text"
              inputMode="decimal"
              value={budgetSttInput}
              onChange={(e) => onBudgetSttInputChange(e.target.value)}
              readOnly={budgetReadOnly}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground read-only:opacity-70 focus:outline-none focus:border-foreground"
              placeholder="0.1"
            />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              STT
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {budgetReadOnly
              ? `Demo uses server default (${formatSttWei(marketplace.budgetSttWei)} per cycle).`
              : "Max STT your sub-agents may spend on Marketplace data each cycle."}
          </p>
        </div>

        <div className="space-y-2 border border-border/60 p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Catalog prices (STT)
          </p>
          <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
            {Object.entries(marketplace.productPricesSttWei).map(
              ([productId, priceWei]) => (
                <li key={productId} className="flex justify-between gap-3">
                  <span>{marketplaceProductLabel(productId)}</span>
                  <span className="text-foreground">
                    {formatSttWei(priceWei)}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function resolveMarketplaceBudgetInput(
  marketplace: MarketplaceSummary | null | undefined,
  strategyBudgetWei: string | null | undefined,
): string {
  const wei =
    strategyBudgetWei ??
    marketplace?.budgetSttWei ??
    "100000000000000000"
  return weiToSttInput(wei)
}
