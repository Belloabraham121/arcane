"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { logout } from "@/lib/api/auth"
import { APP_ROUTES } from "@/lib/routing/app-routes"

type LogoutButtonProps = {
  className?: string
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await logout()
    } finally {
      router.push(APP_ROUTES.signIn)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={
        className ??
        "flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      }
    >
      <LogOut size={14} strokeWidth={1.5} />
      {loading ? "Signing out…" : "Log out"}
    </button>
  )
}
