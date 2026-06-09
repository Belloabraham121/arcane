"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { PixelatedCycle } from "@/components/pixelated-cycle";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/providers/session-provider";
import { getAgentStrategy, upsertAgentStrategy } from "@/lib/api/strategy";
import { DEFAULT_POOL_ALLOCATIONS } from "@/lib/api/strategy-types";
import { APP_ROUTES, setupRouteFor } from "@/lib/routing/app-routes";

const ease = [0.22, 1, 0.36, 1] as const;

export default function StrategyOnboardingPage() {
  const router = useRouter();
  const { sessionReady, accountMode, tradingWalletAddress } = useSession();
  const isDemo = accountMode === "demo";
  const [hoveredStrategy, setHoveredStrategy] = useState<
    "auto" | "custom" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<"auto" | "custom" | null>(null);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    async function load() {
      try {
        if (accountMode == null) {
          router.replace(APP_ROUTES.accountModeOnboarding);
          return;
        }

        const strategyResult = await getAgentStrategy();
        if (strategyResult.success && strategyResult.data?.strategy) {
          const { strategy } = strategyResult.data;
          if (strategy.status === "active" && strategy.depositAmount > 0) {
            router.replace(APP_ROUTES.dashboard);
            return;
          }
        }
      } catch {
        setError("Unable to load. Check that the backend is running.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router, sessionReady, accountMode]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    if (!tradingWalletAddress) {
      router.replace(APP_ROUTES.signIn);
    }
  }, [sessionReady, tradingWalletAddress, router]);

  async function chooseStrategy(type: "auto" | "custom") {
    setChoosing(type);
    setError(null);

    if (!tradingWalletAddress) {
      router.push(APP_ROUTES.signIn);
      return;
    }

    const result = await upsertAgentStrategy({
      strategyType: type,
      status: "draft",
      depositAmount: 0,
      poolAllocations: type === "custom" ? DEFAULT_POOL_ALLOCATIONS : undefined,
    });

    if (!result.success) {
      setError(result.error?.message ?? "Failed to save strategy choice");
      setChoosing(null);
      return;
    }

    router.push(setupRouteFor(type));
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease }}
        className="mb-12 flex items-center gap-4"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          {"// SECTION: STRATEGY_SELECTION"}
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          001
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease }}
        className="mb-4 text-3xl font-pixel uppercase tracking-tight lg:text-4xl"
      >
        Agent Strategy
      </motion.h1>
      <p className="mb-8 max-w-xl text-xs font-mono text-muted-foreground">
        {isDemo
          ? "Choose how your demo agent is set up. Next step configures pools on the Anvil fork — no mainnet deposit."
          : "Choose how your agent network is set up. Next step configures your live mainnet agent and deposit."}
      </p>
      {error && (
        <p className="mb-8 text-xs font-mono text-[#ea580c]">{error}</p>
      )}

      <div className="grid max-w-4xl grid-cols-1 gap-8 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-80 w-full rounded-lg" />
            <Skeleton className="h-80 w-full rounded-lg" />
          </>
        ) : (
          (["auto", "custom"] as const).map((type, index) => (
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
                    <PixelatedCycle
                      isHovered={hoveredStrategy === type}
                      size="lg"
                    />
                  </div>
                  <h3 className="text-2xl font-pixel uppercase mb-3 tracking-wide text-foreground">
                    {type.toUpperCase()}
                    {choosing === type ? "…" : ""}
                  </h3>
                  <p className="text-xs font-mono text-muted-foreground leading-relaxed max-w-xs">
                    {type === "auto"
                      ? isDemo
                        ? "Preset strategy and sub-agents for paper trading on the demo fork."
                        : "Arcane assigns a precise preset strategy and sub-agents. You review and deposit."
                      : isDemo
                        ? "Pick pools and prompts for demo trading on the fork."
                        : "Choose QuickSwap pools and sub-agents yourself, then deposit and launch."}
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
          ))
        )}
      </div>
    </main>
  );
}
