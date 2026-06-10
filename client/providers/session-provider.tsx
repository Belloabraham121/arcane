"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { usePathname } from "next/navigation"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import {
  fetchUserProfile,
  tradingWalletForProfile,
  type AccountMode,
  type UserProfile,
} from "@/lib/api/profile"

type SessionContextValue = {
  sessionReady: boolean
  profile: UserProfile | null
  accountMode: AccountMode | null
  liveWalletAddress: string | null
  demoWalletAddress: string | null
  /** Active trading wallet for the user's account mode. */
  tradingWalletAddress: string | null
  /** Custodial live agent wallet (same as liveWalletAddress). */
  walletAddress: string | null
  refreshSession: () => Promise<UserProfile | null>
}

const SessionContext = createContext<SessionContextValue>({
  sessionReady: false,
  profile: null,
  accountMode: null,
  liveWalletAddress: null,
  demoWalletAddress: null,
  tradingWalletAddress: null,
  walletAddress: null,
  refreshSession: async () => null,
})

export function useSession() {
  return useContext(SessionContext)
}

function applyUserToSession(
  user: UserProfile,
  setters: {
    setProfile: (v: UserProfile | null) => void
    setAccountMode: (v: AccountMode | null) => void
    setLiveWalletAddress: (v: string | null) => void
    setDemoWalletAddress: (v: string | null) => void
    setTradingWalletAddress: (v: string | null) => void
    setWalletAddress: (v: string | null) => void
  },
) {
  setters.setProfile(user)
  setters.setAccountMode(user.accountMode)
  setters.setLiveWalletAddress(user.liveWalletAddress)
  setters.setDemoWalletAddress(user.demoWalletAddress)
  setters.setTradingWalletAddress(
    user.accountMode != null
      ? tradingWalletForProfile(user)
      : user.liveWalletAddress,
  )
  setters.setWalletAddress(user.liveWalletAddress)
}

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [accountMode, setAccountMode] = useState<AccountMode | null>(null)
  const [liveWalletAddress, setLiveWalletAddress] = useState<string | null>(null)
  const [demoWalletAddress, setDemoWalletAddress] = useState<string | null>(null)
  const [tradingWalletAddress, setTradingWalletAddress] = useState<string | null>(
    null,
  )
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    const result = await fetchUserProfile()
    if (result.success && result.data?.user) {
      applyUserToSession(result.data.user, {
        setProfile,
        setAccountMode,
        setLiveWalletAddress,
        setDemoWalletAddress,
        setTradingWalletAddress,
        setWalletAddress,
      })
      setSessionReady(true)
      return result.data.user
    }

    setProfile(null)
    setSessionReady(true)
    return null
  }, [])

  const pathname = usePathname()

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    if (!sessionReady) {
      return
    }
    void refreshSession()
  }, [pathname, sessionReady, refreshSession])

  return (
    <SessionContext.Provider
      value={{
        sessionReady,
        profile,
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
