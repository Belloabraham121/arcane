export const APP_ROUTES = {
  signIn: "/auth/signin",
  accountModeOnboarding: "/onboarding/account-mode",
  strategyOnboarding: "/onboarding/strategy",
  setupAuto: "/setup/auto",
  setupCustom: "/setup/custom",
  dashboard: "/dashboard",
  agentCanvas: "/dashboard/agents",
  tradingHistory: "/dashboard/trading",
  explorer: "/dashboard/explorer",
} as const

export function setupRouteFor(strategyType: "auto" | "custom") {
  return strategyType === "auto" ? APP_ROUTES.setupAuto : APP_ROUTES.setupCustom
}
