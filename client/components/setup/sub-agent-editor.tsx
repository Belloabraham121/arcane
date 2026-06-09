import type { MarketplaceSummary } from "@/lib/api/strategy-types"
import type { SubAgentConfigItem } from "@/lib/api/strategy-types"
import {
  formatSttWei,
  marketplaceProductLabel,
  subAgentHasMarketplaceProduct,
  SUB_AGENT_MARKETPLACE_PRODUCTS,
} from "@/lib/marketplace-display"

type SubAgentEditorProps = {
  agents: SubAgentConfigItem[]
  onChange: (next: SubAgentConfigItem[]) => void
  title?: string
  marketplace?: MarketplaceSummary | null
}

function agentUsesMarketplace(agent: SubAgentConfigItem): boolean {
  return agent.useMarketplaceData !== false
}

export function SubAgentEditor({
  agents,
  onChange,
  title = "Sub-agents",
  marketplace,
}: SubAgentEditorProps) {
  const marketplaceActive = marketplace?.enabled === true

  function updateAgent(id: string, patch: Partial<SubAgentConfigItem>) {
    onChange(agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)))
  }

  return (
    <div className="border border-border p-6">
      <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agents.map((agent) => {
          const productId = SUB_AGENT_MARKETPLACE_PRODUCTS[agent.id]
          const showMarketplaceToggle =
            marketplaceActive &&
            agent.id !== "root-orchestrator" &&
            subAgentHasMarketplaceProduct(agent.id)
          const productPriceWei =
            productId && marketplace
              ? marketplace.productPricesSttWei[productId]
              : undefined

          return (
            <div key={agent.id} className="space-y-3 border border-border p-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={agent.enabled}
                  onChange={(e) => updateAgent(agent.id, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-[#ea580c]"
                />
                <input
                  type="text"
                  value={agent.name}
                  onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                  className="flex-1 border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
                />
              </label>

              {showMarketplaceToggle && (
                <label className="flex items-start gap-3 rounded border border-[#00ff88]/25 bg-[#00ff88]/5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={agentUsesMarketplace(agent)}
                    disabled={!agent.enabled}
                    onChange={(e) =>
                      updateAgent(agent.id, {
                        useMarketplaceData: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 accent-[#00ff88] disabled:opacity-40"
                  />
                  <span className="space-y-0.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    <span className="block text-foreground">
                      Use Marketplace data
                    </span>
                    {productId && (
                      <span className="block">
                        {marketplaceProductLabel(productId)}
                        {productPriceWei
                          ? ` · ${formatSttWei(productPriceWei)}`
                          : ""}
                      </span>
                    )}
                  </span>
                </label>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  System prompt
                </label>
                <textarea
                  value={agent.systemPrompt}
                  onChange={(e) =>
                    updateAgent(agent.id, { systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="w-full resize-none border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
