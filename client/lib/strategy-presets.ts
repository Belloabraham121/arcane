import { DEFAULT_POOL_ALLOCATIONS } from "@/lib/api/strategy-types"

export type PresetSubAgent = {
  id: string
  name: string
  model: string
  role: string
}

export type CustomSubAgent = {
  id: string
  name: string
  role: string
  enabled: boolean
}

export const AUTO_PRESET_POOLS = DEFAULT_POOL_ALLOCATIONS

export const AUTO_PRESET_SUB_AGENTS: PresetSubAgent[] = [
  {
    id: "root-orchestrator",
    name: "Root Orchestrator",
    model: "Claude Sonnet",
    role: "Portfolio-level strategy and capital routing across QuickSwap pools",
  },
  {
    id: "yield-executor",
    name: "Yield Executor",
    model: "GPT-4o-mini",
    role: "Executes rebalances across QuickSwap liquidity pools",
  },
  {
    id: "signal-scout",
    name: "Signal Scout",
    model: "GPT-4o-mini",
    role: "Monitors APR shifts and publishes buy/sell signals",
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    model: "GPT-4o-mini",
    role: "Caps exposure per QuickSwap pool and pauses risky routes",
  },
]

export const DEFAULT_CUSTOM_SUB_AGENTS: CustomSubAgent[] = [
  {
    id: "yield-executor",
    name: "Yield Executor",
    role: "Execute capital moves across selected QuickSwap pools",
    enabled: true,
  },
  {
    id: "signal-scout",
    name: "Signal Scout",
    role: "Scan markets and generate trading signals",
    enabled: true,
  },
  {
    id: "risk-manager",
    name: "Risk Manager",
    role: "Limit exposure and halt risky agent actions",
    enabled: true,
  },
  {
    id: "bridge-scout",
    name: "Bridge Scout",
    role: "Find and evaluate cross-chain opportunities",
    enabled: false,
  },
]

export const POOL_LABELS: Record<string, string> = {
  "usdce-wsomi": "USDCe/WSOMI",
  "usdce-weth": "USDCe/WETH",
  "wsomi-weth": "WSOMI/WETH",
}

/** @deprecated Use POOL_LABELS */
export const PROTOCOL_LABELS = POOL_LABELS
