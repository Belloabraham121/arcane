"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { AppNavBar } from "@/components/auth/app-nav-bar"
import { PixelatedCycle } from "@/components/pixelated-cycle"
import { getMe } from "@/lib/api/auth"
import { getAgentStrategy, upsertAgentStrategy } from "@/lib/api/strategy"
import { DEFAULT_PROTOCOL_ALLOCATIONS } from "@/lib/api/strategy-types"
import { APP_ROUTES, setupRouteFor } from "@/lib/routing/app-routes"

const ease = [0.22, 1, 0.36, 1] as const

export default function StrategyOnboardingPage() {
  const router = useRouter()
  const [hoveredStrategy, setHoveredStrategy] = useState<"auto" | "custom" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [choosing, setChoosing] = useState<"auto" | "custom" | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const meResult = await getMe()
        if (!meResult.success || !meResult.data?.user) {
          router.replace(APP_ROUTES.signIn)
          return
        }

        const strategyResult = await getAgentStrategy()
        if (strategyResult.success && strategyResult.data?.strategy) {
          const { strategy } = strategyResult.data
          if (strategy.status === "active" && strategy.depositAmount > 0) {
            router.replace(APP_ROUTES.dashboard)
            return
          }
        }
      } catch {
        setError("Unable to load. Check that the backend is running.")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  async function chooseStrategy(type: "auto" | "custom") {
    setChoosing(type)
    setError(null)

    const meResult = await getMe()
    if (!meResult.success || !meResult.data?.user) {
      router.push(APP_ROUTES.signIn)
      return
    }

    const result = await upsertAgentStrategy({
      strategyType: type,
      status: "draft",
      depositAmount: 0,
      protocolAllocations:
        type === "custom" ? DEFAULT_PROTOCOL_ALLOCATIONS : undefined,
    })

    if (!result.success) {
      setError(result.error?.message ?? "Failed to save strategy choice")
      setChoosing(null)
      return
    }

    router.push(setupRouteFor(type))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
        <p className="font-mono text-xs text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <AppNavBar />

      <main className="max-w-7xl mx-auto px-6 py-12 lg:px-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease }}
          className="flex items-center gap-4 mb-12"
        >
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {"// SECTION: STRATEGY_SELECTION"}
          </span>
          <div className="flex-1 border-t border-border" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">001</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-3xl lg:text-4xl font-pixel uppercase tracking-tight mb-4"
        >
          Agent Strategy
        </motion.h1>
        <p className="text-xs font-mono text-muted-foreground mb-8 max-w-xl">
          Choose how your agent network is set up. This is separate from your dashboard — you
          will configure and deposit on the next page.
        </p>
        {error && <p className="text-xs font-mono text-[#ea580c] mb-8">{error}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
          {(["auto", "custom"] as const).map((type, index) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease }}
              onMouseEnter={() => setHoveredStrategy(type)}
              onMouseLeave={() => setHoveredStrategy(null)}
            >
              <button
                type="button"
                disabled={choosing !== null}
                onClick={() => chooseStrategy(type)}
                className="group relative h-80 w-full cursor-pointer text-left transition-all duration-300 disabled:opacity-60"
              >
                <motion.div
                  animate={{
                    boxShadow:
                      hoveredStrategy === type
                        ? "0 0 40px rgba(234, 88, 12, 0.5)"
                        : "0 0 20px rgba(234, 88, 12, 0.2)",
                  }}
                  className="absolute inset-0 overflow-hidden rounded-lg border-2 border-foreground"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent" />
                </motion.div>

                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-6">
                    <PixelatedCycle isHovered={hoveredStrategy === type} size="lg" />
                  </div>
                  <h3 className="text-2xl font-pixel uppercase mb-3 tracking-wide text-foreground">
                    {type.toUpperCase()}
                    {choosing === type ? "…" : ""}
                  </h3>
                  <p className="text-xs font-mono text-muted-foreground leading-relaxed max-w-xs">
                    {type === "auto"
                      ? "Arcane assigns a precise preset strategy and sub-agents. You review and deposit."
                      : "Configure protocols and sub-agents yourself, then deposit and launch."}
                  </p>
                </div>

                {hoveredStrategy === type && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-4 right-4"
                  >
                    <ChevronRight size={20} className="text-[#ea580c]" />
                  </motion.div>
                )}
              </button>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  )
}
