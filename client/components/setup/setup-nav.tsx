"use client"

import { AccountModeBadge } from "@/components/layout/account-mode-badge"
import { PageSubBar } from "@/components/layout/page-sub-bar"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { useSession } from "@/providers/session-provider"

type SetupNavProps = {
  title: string
  backHref?: string
  backLabel?: string
}

export function SetupNav({
  title,
  backHref = APP_ROUTES.strategyOnboarding,
  backLabel = "Change strategy",
}: SetupNavProps) {
  const { accountMode } = useSession()

  return (
    <PageSubBar
      title={title}
      badge={accountMode ? <AccountModeBadge mode={accountMode} /> : undefined}
      backHref={backHref}
      backLabel={backLabel}
    />
  )
}
