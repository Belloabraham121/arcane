"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth"

export default function LegacyDepositRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    resolvePostAuthRoute().then((route) => router.replace(route))
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="font-mono text-xs text-muted-foreground">Redirecting…</p>
    </div>
  )
}
