"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { getAgentStrategy, upsertAgentStrategy } from "@/lib/api/strategy"
import type { PoolSortField } from "@/lib/api/quickswap-types"
import {
  DEFAULT_DEPOSIT_AMOUNT,
  type PoolAllocations,
  type SubAgentConfigItem,
} from "@/lib/api/strategy-types"
import { DepositAddressCard } from "@/components/setup/deposit-address-card"
import { PoolAllocationEditor } from "@/components/setup/pool-allocation-editor"
import { SetupNav } from "@/components/setup/setup-nav"
import { SubAgentEditor } from "@/components/setup/sub-agent-editor"
import {
  DepositAddressCardSkeleton,
  SubAgentEditorSkeleton,
} from "@/components/skeletons/content-skeletons"
import { useQuickSwapPools } from "@/hooks/use-quickswap-pools"
import { useWalletBalances } from "@/hooks/use-wallet-balances"
import { useSession } from "@/providers/session-provider"
import { allocatedPoolIds, tokensFromAllocatedPools } from "@/lib/supported-tokens"
import { APP_ROUTES } from "@/lib/routing/app-routes"
import { activePoolAllocations, mergeStrategyPoolAllocations } from "@/lib/pool-allocations"
import { DEFAULT_CUSTOM_SUB_AGENTS } from "@/lib/strategy-presets"

const ease = [0.22, 1, 0.36, 1] as const

function defaultCustomSubAgents(): SubAgentConfigItem[] {
  return DEFAULT_CUSTOM_SUB_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    systemPrompt: agent.role,
    enabled: agent.enabled,
  }))
}

function CustomSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEditing = searchParams.get("edit") === "1"
  const { walletAddress, sessionReady } = useSession()
  const [poolSort, setPoolSort] = useState<PoolSortField>("liquidity")
  const {
    pools,
    meta,
    loading: poolsLoading,
    refetching: poolsRefetching,
    error: poolsError,
  } = useQuickSwapPools({
    context: "custom",
    sort: poolSort,
  })
  const [depositInput, setDepositInput] = useState(String(DEFAULT_DEPOSIT_AMOUNT))
  const [poolAmounts, setPoolAmounts] = useState<PoolAllocations>({})
  const [subAgents, setSubAgents] = useState<SubAgentConfigItem[]>(defaultCustomSubAgents())
  const [strategyReady, setStrategyReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const poolsHydratedRef = useRef(false)

  const activePoolIds = useMemo(() => allocatedPoolIds(poolAmounts), [poolAmounts])
  const supportedTokens = useMemo(
    () => tokensFromAllocatedPools(pools, poolAmounts),
    [pools, poolAmounts],
  )
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
    reload: reloadBalances,
  } = useWalletBalances(activePoolIds)

  useEffect(() => {
    if (!sessionReady) {
      return
    }
    if (!walletAddress) {
      router.replace(APP_ROUTES.signIn)
    }
  }, [sessionReady, walletAddress, router])

  useEffect(() => {
    if (!sessionReady) {
      return
    }

    let cancelled = false

    async function loadStrategy() {
      const strategyResult = await getAgentStrategy()
      if (cancelled) {
        return
      }

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
        setSubAgents(strategy.subAgents)
        if (strategy.depositAmount > 0) {
          setDepositInput(String(strategy.depositAmount))
        }
      }

      setStrategyReady(true)
    }

    void loadStrategy()

    return () => {
      cancelled = true
    }
  }, [sessionReady, router, isEditing])

  useEffect(() => {
    if (pools.length === 0 || poolsHydratedRef.current) {
      return
    }

    void getAgentStrategy().then((strategyResult) => {
      const saved =
        strategyResult.success && strategyResult.data?.strategy
          ? strategyResult.data.strategy.poolAllocations
          : undefined
      setPoolAmounts(mergeStrategyPoolAllocations(saved, pools))
      poolsHydratedRef.current = true
    })
  }, [pools])

  async function saveSetup() {
    const amount = Number(depositInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the amount you deposited.")
      return
    }

    const allocations = activePoolAllocations(poolAmounts)
    if (Object.keys(allocations).length === 0) {
      setError("Select at least one QuickSwap pool with a positive allocation.")
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
      poolAllocations: allocations,
      subAgents,
    })

    setSaving(false)

    if (!result.success) {
      setError(result.error?.message ?? "Failed to save agent setup")
      return
    }

    router.push(APP_ROUTES.dashboard)
  }

  return (
    <>
      <SetupNav
        title="Custom setup — configure pools, sub-agents, and deposit"
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
            Choose QuickSwap pools, define sub-agent system prompts, deposit to your
            address, then launch your dashboard.
          </p>
        </motion.div>

        {error && <p className="font-mono text-xs text-[#ea580c]">{error}</p>}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          {!sessionReady || !walletAddress ? (
            <DepositAddressCardSkeleton />
          ) : (
            <DepositAddressCard
              address={walletAddress}
              supportedTokens={supportedTokens}
              balances={balances}
              balancesLoading={balancesLoading}
              balancesError={balancesError}
              onRefreshBalances={reloadBalances}
              depositAmount={depositInput}
              onDepositAmountChange={setDepositInput}
            />
          )}
          <PoolAllocationEditor
            pools={pools}
            values={poolAmounts}
            onChange={setPoolAmounts}
            mode="custom"
            editMode
            loading={poolsLoading}
            refetching={poolsRefetching}
            error={poolsError}
            sort={poolSort}
            onSortChange={setPoolSort}
            title={isEditing ? "QuickSwap pools" : "QuickSwap pool allocation"}
            subtitle={
              isEditing
                ? "Manage your active pools or add more from the catalog below."
                : meta?.total
                  ? `${meta.total} pools available — sorted by ${poolSort}. Remove pools you do not want or add from the catalog below.`
                  : "Remove pools you do not want or add from the catalog below."
            }
          />
        </div>

        {!strategyReady ? (
          <SubAgentEditorSkeleton rows={2} />
        ) : (
          <SubAgentEditor agents={subAgents} onChange={setSubAgents} />
        )}

        <button
          type="button"
          disabled={saving || !sessionReady || !walletAddress}
          onClick={saveSetup}
          className="bg-foreground px-8 py-3 font-mono text-xs uppercase tracking-widest text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving
            ? "Activating agent…"
            : isEditing
              ? "Save changes"
              : "Activate agent & launch"}
        </button>
      </main>
    </>
  )
}

export default function CustomSetupPage() {
  return (
    <Suspense fallback={null}>
      <CustomSetupContent />
    </Suspense>
  )
}
