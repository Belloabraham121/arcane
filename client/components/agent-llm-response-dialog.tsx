"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchTradingCycleDetail } from "@/lib/api/trading"

type AgentLlmResponseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cycleId: string | null
  /** Inline text when already available (socket / status). */
  initialText?: string | null
  headline?: string
}

export function AgentLlmResponseDialog({
  open,
  onOpenChange,
  cycleId,
  initialText,
  headline = "Agent response",
}: AgentLlmResponseDialogProps) {
  const [text, setText] = useState(initialText ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    if (initialText?.trim()) {
      setText(initialText)
      setError(null)
      setLoading(false)
      return
    }

    if (!cycleId) {
      setText("")
      setError("No agent response available for this cycle.")
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchTradingCycleDetail(cycleId).then((result) => {
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.success && result.data?.cycle) {
        const cycle = result.data.cycle
        setText(cycle.llmResponse ?? cycle.message ?? "")
        return
      }
      setError(result.error?.message ?? "Failed to load agent response")
    })

    return () => {
      cancelled = true
    }
  }, [open, cycleId, initialText])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden font-mono">
        <DialogHeader>
          <DialogTitle className="text-base">{headline}</DialogTitle>
          <DialogDescription className="text-[10px] uppercase tracking-widest">
            Full OpenAI agent analysis for this trading cycle
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-foreground">
          {loading ? (
            <p className="text-muted-foreground">Loading agent response…</p>
          ) : error ? (
            <p className="text-[#ea580c]">{error}</p>
          ) : text.trim() ? (
            <pre className="whitespace-pre-wrap font-mono text-xs">{text}</pre>
          ) : (
            <p className="text-muted-foreground">
              No written response for this cycle.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
