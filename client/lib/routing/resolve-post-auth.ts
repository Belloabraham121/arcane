import { getMe } from "@/lib/api/auth"
import { getAgentStrategy } from "@/lib/api/strategy"
import { APP_ROUTES, setupRouteFor } from "./app-routes"

export async function resolvePostAuthRoute(): Promise<string> {
  const meResult = await getMe()
  if (!meResult.success || !meResult.data?.user) {
    return APP_ROUTES.signIn
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
