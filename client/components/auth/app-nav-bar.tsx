import Link from "next/link"
import { Cpu } from "lucide-react"
import { LogoutButton } from "@/components/auth/logout-button"

type AppNavBarProps = {
  walletAddress?: string | null
}

export function AppNavBar({ walletAddress }: AppNavBarProps) {
  const shortWallet =
    walletAddress != null
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : null

  return (
    <nav className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-4 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link href="/">
            <div className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <Cpu size={18} strokeWidth={1.5} className="text-foreground" />
              <span className="text-sm font-mono font-bold uppercase tracking-[0.15em]">
                ARCANE
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            {shortWallet && (
              <span className="font-mono text-xs text-muted-foreground">{shortWallet}</span>
            )}
            <LogoutButton />
          </div>
        </div>
      </div>
    </nav>
  )
}
