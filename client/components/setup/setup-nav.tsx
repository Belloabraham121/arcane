import Link from "next/link"
import { Cpu } from "lucide-react"
import { LogoutButton } from "@/components/auth/logout-button"
import { APP_ROUTES } from "@/lib/routing/app-routes"

type SetupNavProps = {
  title: string
  walletAddress?: string | null
  backHref?: string
  backLabel?: string
}

export function SetupNav({
  title,
  walletAddress,
  backHref = APP_ROUTES.strategyOnboarding,
  backLabel = "Change strategy",
}: SetupNavProps) {
  const shortWallet =
    walletAddress != null
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : "—"

  return (
    <>
      <nav className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex cursor-pointer items-center gap-3 transition-opacity hover:opacity-80">
                <Cpu size={18} strokeWidth={1.5} className="text-foreground" />
                <span className="text-sm font-mono font-bold uppercase tracking-[0.15em]">
                  ARCANE
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-muted-foreground">{shortWallet}</span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>

      <div className="border-b border-border bg-background/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-muted-foreground">{title}</div>
            <Link
              href={backHref}
              className="font-mono text-xs uppercase tracking-widest transition-colors hover:text-foreground"
            >
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
