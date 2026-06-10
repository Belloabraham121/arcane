"use client"

import { ChevronRight } from "lucide-react"
import { MarkdownContent } from "@/components/agent/markdown-content"
import { SOMNIA_LLM_SUMMARY_LABEL } from "@/lib/somnia-llm"
import { cn } from "@/lib/utils"

type SomniaLlmSummaryCardProps = {
  summary: string
  onClick: () => void
  className?: string
}

export function SomniaLlmSummaryCard({
  summary,
  onClick,
  className,
}: SomniaLlmSummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full border border-border px-4 py-4 text-left transition-colors",
        "hover:border-[#ea580c]/40 hover:bg-muted/20",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          {SOMNIA_LLM_SUMMARY_LABEL}
        </p>
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-[#ea580c] opacity-80 group-hover:opacity-100">
          View full
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
      <div className="line-clamp-4 max-h-24 overflow-hidden text-left">
        <MarkdownContent content={summary} />
      </div>
    </button>
  )
}
