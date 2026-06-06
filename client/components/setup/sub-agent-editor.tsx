import type { SubAgentConfigItem } from "@/lib/api/strategy-types"

const MODEL_OPTIONS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const

type SubAgentEditorProps = {
  agents: SubAgentConfigItem[]
  onChange: (next: SubAgentConfigItem[]) => void
  title?: string
}

export function SubAgentEditor({
  agents,
  onChange,
  title = "Sub-agents",
}: SubAgentEditorProps) {
  function updateAgent(id: string, patch: Partial<SubAgentConfigItem>) {
    onChange(agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)))
  }

  return (
    <div className="border border-border p-6">
      <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agents.map((agent) => (
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
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Model
              </label>
              <select
                value={agent.model}
                onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                className="w-full border border-border bg-background px-2 py-2 font-mono text-xs text-foreground"
              >
                {MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                {!MODEL_OPTIONS.includes(agent.model as (typeof MODEL_OPTIONS)[number]) && (
                  <option value={agent.model}>{agent.model}</option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                System prompt
              </label>
              <textarea
                value={agent.systemPrompt}
                onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
                rows={4}
                className="w-full resize-none border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:border-foreground"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
