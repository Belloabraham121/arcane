"use client"

import { useCallback, useEffect, useState } from "react"
import type { AccountMode } from "@/lib/api/auth"
import {
  fetchPortfolioSummary,
  type PortfolioSummary,
} from "@/lib/api/portfolio"

export function usePortfolioSummary(
  mode: AccountMode | undefined,
  enabled: boolean,
) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled || !mode) {
      setSummary(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await fetchPortfolioSummary(mode)
    if (!result.success || !result.data) {
      setError(result.error?.message ?? "Failed to load portfolio summary")
      setLoading(false)
      return
    }

    setSummary(result.data)
    setError(null)
    setLoading(false)
  }, [enabled, mode])

  useEffect(() => {
    void reload()
  }, [reload])

  return { summary, loading, error, reload }
}
