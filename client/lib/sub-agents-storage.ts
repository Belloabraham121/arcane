import {
  DEFAULT_CUSTOM_SUB_AGENTS,
  type CustomSubAgent,
} from "@/lib/strategy-presets"

const STORAGE_KEY = "arcane-custom-sub-agents"

export function loadCustomSubAgents(): CustomSubAgent[] {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_SUB_AGENTS

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CUSTOM_SUB_AGENTS
    const parsed = JSON.parse(raw) as CustomSubAgent[]
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : DEFAULT_CUSTOM_SUB_AGENTS
  } catch {
    return DEFAULT_CUSTOM_SUB_AGENTS
  }
}

export function saveCustomSubAgents(agents: CustomSubAgent[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
}
