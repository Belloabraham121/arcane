import Link from "next/link"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { PageSubBar } from "@/components/layout/page-sub-bar"

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
  return <PageSubBar title={title} backHref={backHref} backLabel={backLabel} />
}
