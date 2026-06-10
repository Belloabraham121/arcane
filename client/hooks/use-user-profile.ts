"use client"

import { useCallback, useEffect, useState } from "react"
import {
  fetchUserProfile,
  tradingWalletForProfile,
  type UserProfile,
} from "@/lib/api/profile"

export function useUserProfile(enabled = true) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      setProfile(null)
      setError(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    const result = await fetchUserProfile()
    if (!result.success || !result.data?.user) {
      setError(result.error?.message ?? "Failed to load profile")
      setProfile(null)
      setLoading(false)
      return null
    }

    setProfile(result.data.user)
    setError(null)
    setLoading(false)
    return result.data.user
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    profile,
    loading,
    error,
    reload,
    accountMode: profile?.accountMode ?? null,
    liveWalletAddress: profile?.liveWalletAddress ?? null,
    demoWalletAddress: profile?.demoWalletAddress ?? null,
    tradingWalletAddress: profile
      ? tradingWalletForProfile(profile)
      : null,
  }
}
