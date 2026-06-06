"use client"

import { useEffect, useState } from "react"
import { fetchPools } from "@/lib/api/quickswap"
import type {
  FetchPoolsOptions,
  PoolsListMeta,
  QuickSwapPool,
} from "@/lib/api/quickswap-types"

export function useQuickSwapPools(options?: FetchPoolsOptions) {
  const [pools, setPools] = useState<QuickSwapPool[]>([])
  const [meta, setMeta] = useState<PoolsListMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const context = options?.context
  const sort = options?.sort

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const result = await fetchPools({ context, sort })
      if (cancelled) {
        return
      }

      if (!result.success || !result.data) {
        setError(result.error?.message ?? "Failed to load QuickSwap pools")
        setLoading(false)
        return
      }

      setPools(result.data.pools)
      setMeta(result.data.meta ?? null)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [context, sort])

  return { pools, meta, loading, error }
}
