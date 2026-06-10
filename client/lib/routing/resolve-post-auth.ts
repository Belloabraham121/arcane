import { fetchUserProfile, type UserProfile } from "@/lib/api/profile"
import type { AccountMode } from "@/lib/api/profile"
import { getAgentStrategy } from "@/lib/api/strategy"
import type { AgentStrategy } from "@/lib/api/strategy-types"
import { APP_ROUTES, setupRouteFor } from "./app-routes"

/** Next onboarding step when account mode is unset. */
export function accountModeOnboardingRoute(
  user: Pick<UserProfile, "accountMode">,
): string | null {
  return user.accountMode == null ? APP_ROUTES.accountModeOnboarding : null
}

/** Home route for a saved strategy — shared by dashboard, setup, and onboarding. */
export function resolveStrategyRoute(
  strategy: Pick<
    AgentStrategy,
    "status" | "depositAmount" | "strategyType"
  >,
  accountMode: AccountMode,
): string {
  const isRunnable =
    strategy.status === "active" || strategy.status === "paused"

  if (isRunnable && (accountMode === "live" || strategy.depositAmount > 0)) {
    return APP_ROUTES.dashboard
  }

  return setupRouteFor(strategy.strategyType)
}

export async function resolvePostAuthRoute(): Promise<string> {
  const meResult = await fetchUserProfile()
  if (!meResult.success || !meResult.data?.user) {
    return APP_ROUTES.signIn
  }

  const accountModeRoute = accountModeOnboardingRoute(meResult.data.user)
  if (accountModeRoute) {
    return accountModeRoute
  }

  const accountMode = meResult.data.user.accountMode!
  const strategyResult = await getAgentStrategy(accountMode)
  if (!strategyResult.success || !strategyResult.data?.strategy) {
    return APP_ROUTES.strategyOnboarding
  }

  return resolveStrategyRoute(strategyResult.data.strategy, accountMode)
}
