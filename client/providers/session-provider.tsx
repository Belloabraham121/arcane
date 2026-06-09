"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { getMe } from "@/lib/api/auth"

type SessionContextValue = {
  walletAddress: string | null
  sessionReady: boolean
}

const SessionContext = createContext<SessionContextValue>({
  walletAddress: null,
  sessionReady: false,
})

export function useSession() {
  return useContext(SessionContext)
}

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await getMe()
      if (cancelled) {
        return
      }
      if (result.success && result.data?.user.walletAddress) {
        setWalletAddress(result.data.user.walletAddress)
      }
      setSessionReady(true)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SessionContext.Provider value={{ walletAddress, sessionReady }}>
      <div className="min-h-screen bg-background dot-grid-bg">
        <AppNavBar walletAddress={walletAddress} />
        {children}
      </div>
    </SessionContext.Provider>
  )
}
