"use client"

import { useCallback, useEffect, useState } from "react"
import type { AccountMode } from "@/lib/api/auth"
import { fetchWalletBalances } from "@/lib/api/wallet"
import type { WalletTokenBalance } from "@/lib/api/wallet"

export function useWalletBalances(
  poolIds?: string[],
  refreshMs = 30_000,
  mode?: AccountMode,
) {
  const [balances, setBalances] = useState<WalletTokenBalance[]>([])
  const [walletAddress, setWalletAddress] = useState<`0x${string}` | null>(null)
  const [chainLabel, setChainLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolKey = poolIds?.length ? poolIds.slice().sort().join(",") : "all"
  const modeKey = mode ?? "default"

  const reload = useCallback(async () => {
    const ids = poolKey === "all" ? undefined : poolKey.split(",")
    const result = await fetchWalletBalances(ids, mode)
    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to load wallet balances")
      setLoading(false)
      return
    }
    setBalances(result.data.balances)
    setWalletAddress(result.data.walletAddress)
    setChainLabel(result.data.chainLabel ?? null)
    setError(null)
    setLoading(false)
  }, [poolKey, mode])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const ids = poolKey === "all" ? undefined : poolKey.split(",")

    async function load() {
      const result = await fetchWalletBalances(ids, mode)
      if (cancelled) {
        return
      }
      if (!result.success || !result.data) {
        setError(result.error?.message ?? "Failed to load wallet balances")
        setLoading(false)
        return
      }
      setBalances(result.data.balances)
      setWalletAddress(result.data.walletAddress)
      setChainLabel(result.data.chainLabel ?? null)
      setError(null)
      setLoading(false)
    }

    load()

    if (refreshMs <= 0) {
      return () => {
        cancelled = true
      }
    }

    const timer = window.setInterval(() => {
      void reload()
    }, refreshMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [poolKey, modeKey, refreshMs, reload])

  return { balances, loading, error, walletAddress, chainLabel, reload }
}
