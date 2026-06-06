"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { getMe } from "@/lib/api/auth"
import { getAgentStrategy, upsertAgentStrategy } from "@/lib/api/strategy"
import {
  DEFAULT_DEPOSIT_AMOUNT,
  DEFAULT_PROTOCOL_ALLOCATIONS,
  type ProtocolAllocations,
  type SubAgentConfigItem,
} from "@/lib/api/strategy-types"
import { DepositAddressCard } from "@/components/setup/deposit-address-card"
import { ProtocolAllocationEditor } from "@/components/setup/protocol-allocation-editor"
import { SetupNav } from "@/components/setup/setup-nav"
import { SubAgentEditor } from "@/components/setup/sub-agent-editor"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { DEFAULT_CUSTOM_SUB_AGENTS } from "@/lib/strategy-presets"

const ease = [0.22, 1, 0.36, 1] as const

function defaultCustomSubAgents(): SubAgentConfigItem[] {
  return DEFAULT_CUSTOM_SUB_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    model: "gpt-4o-mini",
    systemPrompt: agent.role,
    enabled: agent.enabled,
  }))
}

function CustomSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEditing = searchParams.get("edit") === "1"
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [depositInput, setDepositInput] = useState(String(DEFAULT_DEPOSIT_AMOUNT))
  const [protocolAmounts, setProtocolAmounts] = useState<ProtocolAllocations>(
    DEFAULT_PROTOCOL_ALLOCATIONS,
  )
  const [subAgents, setSubAgents] = useState<SubAgentConfigItem[]>(defaultCustomSubAgents())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const meResult = await getMe()
      if (!meResult.success || !meResult.data?.user) {
        router.replace(APP_ROUTES.signIn)
        return
      }

      setWalletAddress(meResult.data.user.walletAddress)

      const strategyResult = await getAgentStrategy()
      if (strategyResult.success && strategyResult.data?.strategy) {
        const { strategy } = strategyResult.data
        if (strategy.status === "active" && strategy.depositAmount > 0 && !isEditing) {
          router.replace(APP_ROUTES.dashboard)
          return
        }
        if (strategy.strategyType !== "custom") {
          router.replace(APP_ROUTES.setupAuto)
          return
        }
        setProtocolAmounts(strategy.protocolAllocations)
        setSubAgents(strategy.subAgents)
        if (strategy.depositAmount > 0) {
          setDepositInput(String(strategy.depositAmount))
        }
      }

      setLoading(false)
    }

    load()
  }, [router, isEditing])

  async function saveSetup() {
    const amount = Number(depositInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the amount you deposited.")
      return
    }

    if (subAgents.filter((agent) => agent.enabled).length === 0) {
      setError("Enable at least one sub-agent.")
      return
    }

    setSaving(true)
    setError(null)

    const result = await upsertAgentStrategy({
      strategyType: "custom",
      status: "active",
      depositAmount: amount,
      protocolAllocations: protocolAmounts,
      subAgents,
    })

    setSaving(false)

    if (!result.success) {
      setError(result.error?.message ?? "Failed to save agent setup")
      return
    }

    router.push(APP_ROUTES.dashboard)
  }

  if (loading || !walletAddress) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
        <p className="font-mono text-xs text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      <SetupNav
        title="Custom setup — configure protocols, sub-agents, and deposit"
        walletAddress={walletAddress}
        backHref={isEditing ? APP_ROUTES.dashboard : APP_ROUTES.strategyOnboarding}
        backLabel={isEditing ? "Back to dashboard" : "Change strategy"}
      />

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-12 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="space-y-3"
        >
          <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
            {isEditing ? "Edit setup" : "Step 2 of 2"}
          </p>
          <h1 className="text-3xl font-pixel uppercase tracking-tight">
            Custom Agent Setup
          </h1>
          <p className="max-w-2xl text-xs font-mono leading-relaxed text-muted-foreground">
            Choose protocols, define sub-agent models and system prompts, deposit to your
            address, then launch your dashboard.
          </p>
        </motion.div>

        {error && <p className="font-mono text-xs text-[#ea580c]">{error}</p>}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          <DepositAddressCard
            address={walletAddress}
            depositAmount={depositInput}
            onDepositAmountChange={setDepositInput}
          />
          <ProtocolAllocationEditor values={protocolAmounts} onChange={setProtocolAmounts} />
        </div>

        <SubAgentEditor agents={subAgents} onChange={setSubAgents} />

        <button
          type="button"
          disabled={saving}
          onClick={saveSetup}
          className="bg-foreground px-8 py-3 font-mono text-xs uppercase tracking-widest text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEditing ? "Save changes" : "Launch dashboard"}
        </button>
      </main>
    </div>
  )
}

export default function CustomSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background dot-grid-bg">
          <p className="font-mono text-xs text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <CustomSetupContent />
    </Suspense>
  )
}
