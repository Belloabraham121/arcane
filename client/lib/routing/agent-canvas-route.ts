import type { AccountMode } from "@/lib/api/auth"
import { APP_ROUTES } from "@/lib/routing/app-routes"

export function parseAccountModeParam(
  value: string | null | undefined,
): AccountMode | null {
  if (value === "demo" || value === "live") {
    return value
  }
  return null
}

export function agentCanvasRoute(mode?: AccountMode | null): string {
  if (!mode) {
    return APP_ROUTES.agentCanvas
  }
  return `${APP_ROUTES.agentCanvas}?mode=${mode}`
}

/** Query `?mode=` overrides session for debugging; otherwise use session mode. */
export function resolveAgentCanvasMode(
  sessionMode: AccountMode | null,
  queryMode: string | null | undefined,
): {
  canvasMode: AccountMode | null
  modeOverride: boolean
} {
  const fromQuery = parseAccountModeParam(queryMode)
  if (fromQuery) {
    return {
      canvasMode: fromQuery,
      modeOverride: sessionMode != null && fromQuery !== sessionMode,
    }
  }
  return { canvasMode: sessionMode, modeOverride: false }
}
