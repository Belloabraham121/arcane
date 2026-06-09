"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { AccountMode } from "@/lib/api/auth"
import { updateAccountMode } from "@/lib/api/profile"
import { agentCanvasRoute } from "@/lib/routing/agent-canvas-route"
import { useSession } from "@/providers/session-provider"

type ViewAgentsLinkProps = {
  mode: AccountMode
  label: string
  className?: string
}

export function ViewAgentsLink({ mode, label, className }: ViewAgentsLinkProps) {
  const router = useRouter()
  const { accountMode, profile, refreshSession } = useSession()
  const [navigating, setNavigating] = useState(false)

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (navigating) {
      return
    }

    setNavigating(true)

    try {
      if (accountMode !== mode) {
        const needsLiveConfirm = accountMode === "demo" && mode === "live"
        const confirmLiveWallet =
          needsLiveConfirm && profile?.liveWalletAddress
            ? window.confirm(
                `Switch to live mainnet?\n\nYour live agent wallet:\n${profile.liveWalletAddress}\n\nDeposit real tokens before trading.`,
              )
            : needsLiveConfirm

        if (needsLiveConfirm && !confirmLiveWallet) {
          return
        }

        const result = await updateAccountMode(mode, {
          confirmLiveWallet: needsLiveConfirm ? true : undefined,
        })

        if (!result.success) {
          return
        }

        await refreshSession()
      }

      router.push(agentCanvasRoute(mode))
    } finally {
      setNavigating(false)
    }
  }

  return (
    <Link
      href={agentCanvasRoute(mode)}
      onClick={(event) => void handleClick(event)}
      aria-busy={navigating}
      className={className}
    >
      {navigating ? "Opening…" : label}
    </Link>
  )
}
