"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountMode } from "@/lib/api/auth";

export type PanelId =
  | "graph-settings"
  | "protocol-allocation"
  | "nodes-legend"
  | "live-trades"
  | "legend"
  | "viz-info";

export type PanelLayout = {
  x: number;
  y: number;
  collapsed: boolean;
};

export type PanelLayouts = Record<PanelId, PanelLayout>;

export const GRID_SIZE = 24;

export const DEFAULT_PANEL_LAYOUTS: PanelLayouts = {
  "graph-settings": { x: 24, y: 24, collapsed: false },
  "nodes-legend": { x: 240, y: 24, collapsed: false },
  "live-trades": { x: 0, y: 24, collapsed: false }, // positioned from right in init
  legend: { x: 0, y: 0, collapsed: false },
  "protocol-allocation": { x: 24, y: 0, collapsed: false },
  "viz-info": { x: 24, y: 0, collapsed: false },
};

const LEGACY_STORAGE_KEY = "arcane-agents-panel-layout";

export function panelLayoutStorageKey(
  accountMode?: AccountMode | null,
): string {
  if (accountMode === "demo" || accountMode === "live") {
    return `${LEGACY_STORAGE_KEY}:${accountMode}`;
  }
  return LEGACY_STORAGE_KEY;
}

export function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function loadLayoutsFromStorage(
  accountMode?: AccountMode | null,
): PanelLayouts {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_LAYOUTS;
  }

  const key = panelLayoutStorageKey(accountMode);

  try {
    let raw = localStorage.getItem(key);

    if (!raw && accountMode) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(key, legacy);
      }
    }

    if (!raw) {
      return DEFAULT_PANEL_LAYOUTS;
    }

    const parsed = JSON.parse(raw) as Partial<PanelLayouts>;
    return { ...DEFAULT_PANEL_LAYOUTS, ...parsed };
  } catch {
    return DEFAULT_PANEL_LAYOUTS;
  }
}

export function usePanelLayout(accountMode?: AccountMode | null) {
  const storageKey = panelLayoutStorageKey(accountMode);
  const [layouts, setLayouts] = useState<PanelLayouts>(DEFAULT_PANEL_LAYOUTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLayouts(loadLayoutsFromStorage(accountMode));
    setHydrated(true);
  }, [storageKey, accountMode]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(layouts));
  }, [layouts, hydrated, storageKey]);

  const updatePanel = useCallback(
    (id: PanelId, patch: Partial<PanelLayout>) => {
      setLayouts((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    [],
  );

  const toggleCollapsed = useCallback((id: PanelId) => {
    setLayouts((prev) => ({
      ...prev,
      [id]: { ...prev[id], collapsed: !prev[id].collapsed },
    }));
  }, []);

  return { layouts, updatePanel, toggleCollapsed, hydrated, storageKey };
}
