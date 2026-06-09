"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ChevronRight, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/providers/session-provider";
import { getMe } from "@/lib/api/auth";
import {
  fetchDemoPreview,
  patchAccountMode,
  type DemoPreview,
} from "@/lib/api/account-mode";
import { APP_ROUTES } from "@/lib/routing/app-routes";

const ease = [0.22, 1, 0.36, 1] as const;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-foreground/5"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AccountModeOnboardingPage() {
  const router = useRouter();
  const { sessionReady, refreshSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState<"demo" | "live" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<"demo" | "live" | null>(null);
  const [demoPreview, setDemoPreview] = useState<DemoPreview | null>(null);
  const [liveWalletAddress, setLiveWalletAddress] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    async function load() {
      try {
        const meResult = await getMe();
        if (!meResult.success || !meResult.data?.user) {
          router.replace(APP_ROUTES.signIn);
          return;
        }

        const { user } = meResult.data;
        if (user.accountMode != null) {
          router.replace(APP_ROUTES.strategyOnboarding);
          return;
        }

        setLiveWalletAddress(user.liveWalletAddress);

        const previewResult = await fetchDemoPreview();
        if (previewResult.success && previewResult.data) {
          setDemoPreview(previewResult.data);
        }
      } catch {
        setError("Unable to load. Check that the backend is running.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router, sessionReady]);

  async function chooseMode(mode: "demo" | "live") {
    setChoosing(mode);
    setError(null);

    const result = await patchAccountMode(mode);
    if (!result.success) {
      setError(result.error?.message ?? "Failed to save account mode");
      setChoosing(null);
      return;
    }

    await refreshSession();
    router.push(APP_ROUTES.strategyOnboarding);
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
          {"// SECTION: ACCOUNT_MODE"}
        </span>
        <div className="flex-1 border-t border-border" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          000
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease }}
        className="mb-4 text-3xl font-pixel uppercase tracking-tight lg:text-4xl"
      >
        Demo or Live
      </motion.h1>
      <p className="mb-8 max-w-2xl text-xs font-mono text-muted-foreground">
        Choose how your agent trades. Demo uses a shared paper wallet on a local
        Anvil fork — no real money. Live uses your own custodial agent wallet on
        Somnia mainnet.
      </p>

      {error && (
        <p className="mb-8 text-xs font-mono text-[#ea580c]">{error}</p>
      )}

      <div className="grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-[28rem] w-full rounded-lg" />
            <Skeleton className="h-[28rem] w-full rounded-lg" />
          </>
        ) : (
          (["demo", "live"] as const).map((mode, index) => (
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease }}
              onMouseEnter={() => setHovered(mode)}
              onMouseLeave={() => setHovered(null)}
            >
              <button
                type="button"
                disabled={choosing !== null}
                onClick={() => chooseMode(mode)}
                className="group relative min-h-[28rem] w-full cursor-pointer text-left transition-all duration-300 disabled:opacity-60"
              >
                <motion.div
                  animate={{
                    boxShadow:
                      hovered === mode
                        ? "0 0 40px rgba(234, 88, 12, 0.5)"
                        : "0 0 20px rgba(234, 88, 12, 0.2)",
                  }}
                  className="absolute inset-0 overflow-hidden rounded-lg border-2 border-foreground"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent" />
                </motion.div>

                <div className="relative flex h-full flex-col p-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-2xl font-pixel uppercase tracking-wide">
                      {mode}
                      {choosing === mode ? "…" : ""}
                    </h3>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest ${
                        mode === "demo" ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {mode === "demo" ? "simulation" : "mainnet"}
                    </span>
                  </div>

                  <p className="mb-6 text-xs font-mono leading-relaxed text-muted-foreground">
                    {mode === "demo"
                      ? demoPreview?.description ??
                        "Paper portfolio on Anvil fork. Same agent tools — pre-funded, no deposit required."
                      : "Your personal agent wallet on Somnia mainnet. Deposit real USDCe, WSOMI, or WETH to trade."}
                  </p>

                  <div className="mb-4 space-y-2 border border-border bg-muted/20 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {mode === "demo" ? "Shared demo wallet" : "Your agent wallet"}
                    </p>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 break-all font-mono text-xs">
                        {mode === "demo"
                          ? demoPreview?.demoWalletAddress ?? "0xd1f1…"
                          : liveWalletAddress ?? "—"}
                      </code>
                      <CopyAddressButton
                        address={
                          mode === "demo"
                            ? (demoPreview?.demoWalletAddress ?? "")
                            : (liveWalletAddress ?? "")
                        }
                      />
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {mode === "demo"
                        ? demoPreview?.chainLabel ?? "Anvil fork"
                        : "Somnia mainnet · read-only until you deposit"}
                    </p>
                  </div>

                  {mode === "demo" && demoPreview?.seededBalances.length ? (
                    <div className="mt-auto space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Approx. seeded balances
                      </p>
                      <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                        {demoPreview.seededBalances.map((row) => (
                          <li key={row.symbol}>
                            {row.formatted} {row.symbol}
                            <span className="ml-2 text-[10px] opacity-70">
                              {row.note}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : mode === "live" ? (
                    <p className="mt-auto font-mono text-[10px] text-muted-foreground">
                      Address shown: {liveWalletAddress ? shortenAddress(liveWalletAddress) : "—"}.
                      Fund this wallet on mainnet after setup.
                    </p>
                  ) : null}

                  {hovered === mode && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute bottom-4 right-4"
                    >
                      <ChevronRight size={20} className="text-[#ea580c]" />
                    </motion.div>
                  )}
                </div>
              </button>
            </motion.div>
          ))
        )}
      </div>
    </main>
  );
}
