import { fetchUserProfile, type UserProfile } from "@/lib/api/profile"
import { getAgentStrategy } from "@/lib/api/strategy"
import { APP_ROUTES, setupRouteFor } from "./app-routes"

/** Next onboarding step when account mode is unset. */
export function accountModeOnboardingRoute(
  user: Pick<UserProfile, "accountMode">,
): string | null {
  return user.accountMode == null ? APP_ROUTES.accountModeOnboarding : null
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

  const strategyResult = await getAgentStrategy(meResult.data.user.accountMode!)
  if (!strategyResult.success || !strategyResult.data?.strategy) {
    return APP_ROUTES.strategyOnboarding
  }

  const { strategy } = strategyResult.data
  if (
    (strategy.status === "active" || strategy.status === "paused") &&
    strategy.depositAmount > 0
  ) {
    return APP_ROUTES.dashboard
  }

  return setupRouteFor(strategy.strategyType)
}
