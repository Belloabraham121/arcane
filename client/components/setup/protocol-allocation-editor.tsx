import type { ProtocolAllocations } from "@/lib/api/strategy-types"
import { PROTOCOL_LABELS } from "@/lib/strategy-presets"

type ProtocolAllocationEditorProps = {
  values: ProtocolAllocations
  onChange: (next: ProtocolAllocations) => void
  title?: string
}

export function ProtocolAllocationEditor({
  values,
  onChange,
  title = "Protocol allocation",
}: ProtocolAllocationEditorProps) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)

  return (
    <div className="border border-border p-6">
      <p className="mb-4 text-xs font-mono tracking-widest uppercase text-muted-foreground">
        {title}
      </p>
      <div className="space-y-4">
        {Object.entries(values).map(([key, amount]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase tracking-wide text-foreground">
                {PROTOCOL_LABELS[key] ?? key}
              </label>
              <span className="font-mono text-xs text-muted-foreground">
                {total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : "0%"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount / 1_000_000}
                onChange={(e) => {
                  const next = Math.max(1, parseFloat(e.target.value) || 0) * 1_000_000
                  onChange({ ...values, [key as keyof ProtocolAllocations]: next })
                }}
                className="flex-1 rounded border border-border bg-background px-2 py-2 font-mono text-xs text-foreground"
              />
              <span className="flex items-center font-mono text-xs text-muted-foreground">M</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
