import { getMe, type AuthUser } from "@/lib/api/auth"
import { getAgentStrategy } from "@/lib/api/strategy"
import { APP_ROUTES, setupRouteFor } from "./app-routes"

/** Next onboarding step when account mode is unset. */
export function accountModeOnboardingRoute(user: Pick<AuthUser, "accountMode">): string | null {
  return user.accountMode == null ? APP_ROUTES.accountModeOnboarding : null
}

export async function resolvePostAuthRoute(): Promise<string> {
  const meResult = await getMe()
  if (!meResult.success || !meResult.data?.user) {
    return APP_ROUTES.signIn
  }

  const accountModeRoute = accountModeOnboardingRoute(meResult.data.user)
  if (accountModeRoute) {
    return accountModeRoute
  }

  const strategyResult = await getAgentStrategy()
  if (!strategyResult.success || !strategyResult.data?.strategy) {
    return APP_ROUTES.strategyOnboarding
  }

  const { strategy } = strategyResult.data
  if (strategy.status === "active" && strategy.depositAmount > 0) {
    return APP_ROUTES.dashboard
  }

  return setupRouteFor(strategy.strategyType)
}
