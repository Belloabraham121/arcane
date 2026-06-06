"use client"

import { useEffect, useState } from "react"
import { fetchPools } from "@/lib/api/quickswap"
import type { QuickSwapPool } from "@/lib/api/quickswap-types"

export function useQuickSwapPools() {
  const [pools, setPools] = useState<QuickSwapPool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await fetchPools()
      if (cancelled) {
        return
      }

      if (!result.success || !result.data) {
        setError(result.error?.message ?? "Failed to load QuickSwap pools")
        setLoading(false)
        return
      }

      setPools(result.data.pools)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return { pools, loading, error }
}
