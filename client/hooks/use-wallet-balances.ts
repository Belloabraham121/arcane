"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchWalletBalances } from "@/lib/api/wallet"
import type { WalletTokenBalance } from "@/lib/api/wallet"

export function useWalletBalances(poolIds?: string[], refreshMs = 30_000) {
  const [balances, setBalances] = useState<WalletTokenBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const poolKey = poolIds?.length ? poolIds.slice().sort().join(",") : "all"

  const reload = useCallback(async () => {
    const ids = poolKey === "all" ? undefined : poolKey.split(",")
    const result = await fetchWalletBalances(ids)
    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to load wallet balances")
      setLoading(false)
      return
    }
    setBalances(result.data.balances)
    setError(null)
    setLoading(false)
  }, [poolKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const ids = poolKey === "all" ? undefined : poolKey.split(",")

    async function load() {
      const result = await fetchWalletBalances(ids)
      if (cancelled) {
        return
      }
      if (!result.success || !result.data) {
        setError(result.error?.message ?? "Failed to load wallet balances")
        setLoading(false)
        return
      }
      setBalances(result.data.balances)
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
  }, [poolKey, refreshMs, reload])

  return { balances, loading, error, reload }
}
