"use client"

import {
  agentStatusClassName,
  agentStatusLabel,
  type AgentDisplayStatus,
} from "@/lib/trading-helpers"

type AgentStatusBadgeProps = {
  status: AgentDisplayStatus
  className?: string
}

export function AgentStatusBadge({ status, className = "" }: AgentStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${agentStatusClassName(status)} ${className}`}
    >
      <span
        className={`mr-2 h-1.5 w-1.5 rounded-full ${
          status === "analyzing" || status === "executing"
            ? "animate-pulse bg-current"
            : "bg-current opacity-60"
        }`}
      />
      {agentStatusLabel(status)}
    </span>
  )
}
