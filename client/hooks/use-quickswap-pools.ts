"use client"

import { useEffect, useRef, useState } from "react"
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
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  const context = options?.context
  const sort = options?.sort

  useEffect(() => {
    let cancelled = false
    const isRefetch = hasLoadedRef.current

    async function load() {
      if (isRefetch) {
        setRefetching(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const result = await fetchPools({ context, sort })
      if (cancelled) {
        return
      }

      if (!result.success || !result.data) {
        setError(result.error?.message ?? "Failed to load QuickSwap pools")
        setLoading(false)
        setRefetching(false)
        return
      }

      setPools(result.data.pools)
      setMeta(result.data.meta ?? null)
      hasLoadedRef.current = true
      setLoading(false)
      setRefetching(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [context, sort])

  return { pools, meta, loading, refetching, error }
}
