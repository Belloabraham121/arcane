"use client"

import { useCallback, useEffect, useState } from "react"

export type PanelId =
  | "graph-settings"
  | "protocol-allocation"
  | "nodes-legend"
  | "live-trades"
  | "legend"
  | "viz-info"

export type PanelLayout = {
  x: number
  y: number
  collapsed: boolean
}

export type PanelLayouts = Record<PanelId, PanelLayout>

export const GRID_SIZE = 24

export const DEFAULT_PANEL_LAYOUTS: PanelLayouts = {
  "graph-settings": { x: 24, y: 24, collapsed: false },
  "nodes-legend": { x: 240, y: 24, collapsed: false },
  "live-trades": { x: 0, y: 24, collapsed: false }, // positioned from right in init
  legend: { x: 0, y: 0, collapsed: false },
  "protocol-allocation": { x: 24, y: 0, collapsed: false },
  "viz-info": { x: 24, y: 0, collapsed: false },
}

const STORAGE_KEY = "arcane-agents-panel-layout"

export function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export function usePanelLayout() {
  const [layouts, setLayouts] = useState<PanelLayouts>(DEFAULT_PANEL_LAYOUTS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PanelLayouts>
        setLayouts((prev) => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore invalid storage
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
  }, [layouts, hydrated])

  const updatePanel = useCallback((id: PanelId, patch: Partial<PanelLayout>) => {
    setLayouts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }, [])

  const toggleCollapsed = useCallback((id: PanelId) => {
    setLayouts((prev) => ({
      ...prev,
      [id]: { ...prev[id], collapsed: !prev[id].collapsed },
    }))
  }, [])

  return { layouts, updatePanel, toggleCollapsed, hydrated }
}
