"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { getMe, type AccountMode, type AuthUser } from "@/lib/api/auth"

type SessionContextValue = {
  sessionReady: boolean
  accountMode: AccountMode | null
  liveWalletAddress: string | null
  demoWalletAddress: string | null
  /** Active trading wallet for the user's account mode. */
  tradingWalletAddress: string | null
  /** Custodial live agent wallet (same as liveWalletAddress). */
  walletAddress: string | null
  refreshSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  sessionReady: false,
  accountMode: null,
  liveWalletAddress: null,
  demoWalletAddress: null,
  tradingWalletAddress: null,
  walletAddress: null,
  refreshSession: async () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

function tradingWalletForUser(user: AuthUser): string {
  return user.accountMode === "demo"
    ? user.demoWalletAddress
    : user.liveWalletAddress
}

function applyUserToSession(
  user: AuthUser,
  setters: {
    setAccountMode: (v: AccountMode | null) => void
    setLiveWalletAddress: (v: string | null) => void
    setDemoWalletAddress: (v: string | null) => void
    setTradingWalletAddress: (v: string | null) => void
    setWalletAddress: (v: string | null) => void
  },
) {
  setters.setAccountMode(user.accountMode)
  setters.setLiveWalletAddress(user.liveWalletAddress)
  setters.setDemoWalletAddress(user.demoWalletAddress)
  setters.setTradingWalletAddress(
    user.accountMode != null ? tradingWalletForUser(user) : user.liveWalletAddress,
  )
  setters.setWalletAddress(user.liveWalletAddress)
}

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false)
  const [accountMode, setAccountMode] = useState<AccountMode | null>(null)
  const [liveWalletAddress, setLiveWalletAddress] = useState<string | null>(null)
  const [demoWalletAddress, setDemoWalletAddress] = useState<string | null>(null)
  const [tradingWalletAddress, setTradingWalletAddress] = useState<string | null>(
    null,
  )
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    const result = await getMe()
    if (result.success && result.data?.user) {
      applyUserToSession(result.data.user, {
        setAccountMode,
        setLiveWalletAddress,
        setDemoWalletAddress,
        setTradingWalletAddress,
        setWalletAddress,
      })
    }
    setSessionReady(true)
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  return (
    <SessionContext.Provider
      value={{
        sessionReady,
        accountMode,
        liveWalletAddress,
        demoWalletAddress,
        tradingWalletAddress,
        walletAddress,
        refreshSession,
      }}
    >
      <div className="min-h-screen bg-background dot-grid-bg">
        <AppNavBar
          walletAddress={tradingWalletAddress ?? walletAddress}
          accountMode={accountMode}
        />
        {children}
      </div>
    </SessionContext.Provider>
  )
}
