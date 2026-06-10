"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { AccountMode } from "@/lib/api/auth"
import { AccountModeSwitchDialog } from "@/components/layout/account-mode-switch-dialog"
import { useAccountModeSwitch } from "@/hooks/use-account-mode-switch"
import { agentCanvasRoute } from "@/lib/routing/agent-canvas-route"
import { useSession } from "@/providers/session-provider"

type ViewAgentsLinkProps = {
  mode: AccountMode
  label: string
  className?: string
}

export function ViewAgentsLink({ mode, label, className }: ViewAgentsLinkProps) {
  const router = useRouter()
  const { accountMode } = useSession()
  const [navigating, setNavigating] = useState(false)

  const {
    pendingMode,
    switching,
    error,
    requestSwitch,
    confirmSwitch,
    cancelSwitch,
    liveWalletAddress,
    demoWalletAddress,
  } = useAccountModeSwitch()

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (navigating || switching) {
      return
    }

    if (accountMode === mode) {
      router.push(agentCanvasRoute(mode))
      return
    }

    setNavigating(true)
    if (!requestSwitch(mode)) {
      setNavigating(false)
    }
  }

  function handleCancel() {
    cancelSwitch()
    setNavigating(false)
  }

  async function handleConfirm() {
    const switched = await confirmSwitch()
    setNavigating(false)
    if (switched) {
      router.push(agentCanvasRoute(mode))
    }
  }

  return (
    <>
      <Link
        href={agentCanvasRoute(mode)}
        onClick={(event) => void handleClick(event)}
        aria-busy={navigating || switching}
        className={className}
      >
        {navigating || switching ? "Opening…" : label}
      </Link>

      <AccountModeSwitchDialog
        open={pendingMode != null}
        targetMode={pendingMode}
        liveWalletAddress={liveWalletAddress}
        demoWalletAddress={demoWalletAddress}
        switching={switching}
        error={pendingMode ? error : null}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancel}
      />
    </>
  )
}
