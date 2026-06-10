"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountModeBadge } from "@/components/layout/account-mode-badge";
import { PageSubBar } from "@/components/layout/page-sub-bar";
import { AgentsCanvasSkeleton } from "@/components/skeletons/content-skeletons";
import { DraggableGridPanel } from "@/components/draggable-grid-panel";
import { AgentCycleExecutionPanel } from "@/components/agent-cycle-execution-panel";
import { AgentLlmResponseDialog } from "@/components/agent-llm-response-dialog";
import { AgentTradingFeed } from "@/components/agent-trading-feed";
import { CanvasPortfolioBar } from "@/components/canvas-portfolio-bar";
import { PoolNodesLegend } from "@/components/pool-nodes-legend";
import { PoolTradingCanvas } from "@/components/pool-trading-canvas";
import { useTradingSocket } from "@/hooks/use-trading-socket";
import {
  outcomeFromCycleSummary,
  outcomeFromSocketCompleted,
  runningOutcome,
  type AgentCycleOutcome,
} from "@/lib/agent-cycle-outcome";
import { fetchTradingStatus, type ExecutedTransaction } from "@/lib/api/trading";
import type { LiveTradingFeedItem } from "@/lib/api/trading-socket-types";
import { fetchPools } from "@/lib/api/quickswap";
import type { QuickSwapPool } from "@/lib/api/quickswap-types";
import { getAgentStrategy } from "@/lib/api/strategy";
import type { AccountMode } from "@/lib/api/auth";
import { useSession } from "@/providers/session-provider";
import {
  DEFAULT_POOL_ALLOCATIONS,
  type MarketplaceSummary,
  type PoolAllocations,
  type SubAgentConfigItem,
} from "@/lib/api/strategy-types";
import { sumSttWei } from "@/lib/marketplace-display";
import {
  largestResolvablePoolId,
  resolveStrategyCanvasPools,
} from "@/lib/pool-resolve";
import {
  idleRouteForPool,
  normalizePoolRouteCommand,
} from "@/lib/trading-feed-helpers";
import { usePortfolioSummary } from "@/hooks/use-portfolio-summary";
import { resolveAgentCanvasMode } from "@/lib/routing/agent-canvas-route";
import { APP_ROUTES } from "@/lib/routing/app-routes";
import { resolvePostAuthRoute } from "@/lib/routing/resolve-post-auth";
import {
  GRID_SIZE,
  panelLayoutStorageKey,
  snapToGrid,
  usePanelLayout,
  type PanelId,
} from "@/hooks/use-panel-layout";

function AgentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionReady, accountMode } = useSession();
  const { canvasMode, modeOverride } = resolveAgentCanvasMode(
    accountMode,
    searchParams.get("mode"),
  );
  const isDemo = canvasMode === "demo";
  const [poolAmounts, setPoolAmounts] = useState<PoolAllocations>(
    DEFAULT_POOL_ALLOCATIONS,
  );
  const [quickswapPools, setQuickswapPools] = useState<QuickSwapPool[]>([]);
  const [subAgentConfig, setSubAgentConfig] = useState<SubAgentConfigItem[]>([]);
  const [marketplaceSummary, setMarketplaceSummary] =
    useState<MarketplaceSummary | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<
    "draft" | "active" | "paused" | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [cycleOutcome, setCycleOutcome] = useState<AgentCycleOutcome | null>(
    null,
  );
  const [lastExecutedTxs, setLastExecutedTxs] = useState<ExecutedTransaction[]>(
    [],
  );
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [llmDialogCycleId, setLlmDialogCycleId] = useState<string | null>(null);
  const [llmDialogText, setLlmDialogText] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { layouts, updatePanel, toggleCollapsed, hydrated } =
    usePanelLayout(canvasMode);
  const [defaultsAppliedFor, setDefaultsAppliedFor] = useState<
    AccountMode | null
  >(null);

  const { summary: portfolio } = usePortfolioSummary(canvasMode ?? undefined, !loading && canvasMode != null);

  const canvasPools = useMemo(
    () => resolveStrategyCanvasPools(poolAmounts, quickswapPools),
    [poolAmounts, quickswapPools],
  );

  const idlePoolRoute = useMemo(() => {
    const poolId = largestResolvablePoolId(poolAmounts, quickswapPools);
    return idleRouteForPool(poolId);
  }, [poolAmounts, quickswapPools]);

  const enabledSubAgentIds = useMemo(
    () =>
      subAgentConfig
        .filter((a) => a.enabled && a.id !== "root-orchestrator")
        .map((a) => a.id),
    [subAgentConfig],
  );

  const {
    connected,
    feedItems,
    routeCommand,
    cycleActive,
    subAgentStatuses,
    marketplaceTripCommands,
  } = useTradingSocket({
    accountMode: canvasMode ?? undefined,
    enabled:
      !loading && canvasMode != null && strategyStatus === "active",
    hydrateFromHistory: true,
    onCycleStarted: (event) => {
      setCycleOutcome(runningOutcome(event.cycleId, event.reason));
      setLastExecutedTxs([]);
    },
    onCycleCompleted: (event) => {
      setCycleOutcome(outcomeFromSocketCompleted(event));
    },
    onActionExecuted: (event) => {
      if (!event.txHash) {
        return;
      }
      setLastExecutedTxs((prev) => {
        if (prev.some((tx) => tx.hash === event.txHash)) {
          return prev;
        }
        return [
          {
            kind: event.type === "approve" ? "approve" : "swap",
            hash: event.txHash!,
            status: event.status === "success" ? "success" : "reverted",
            tokenIn: event.tokenIn ?? undefined,
            tokenOut: event.tokenOut ?? undefined,
            amountIn: event.amountIn ?? undefined,
            amountOut: event.amountOut ?? undefined,
          },
          ...prev,
        ];
      });
    },
  });

  const displayRoute = useMemo(() => {
    const raw = routeCommand ?? idlePoolRoute;
    return normalizePoolRouteCommand(raw, quickswapPools);
  }, [routeCommand, idlePoolRoute, quickswapPools]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    setLoading(true);

    async function load() {
      const route = await resolvePostAuthRoute();
      if (route !== APP_ROUTES.dashboard) {
        router.replace(route);
        return;
      }

      const [strategyResult, poolsResult] = await Promise.all([
        getAgentStrategy(canvasMode ?? undefined),
        fetchPools(),
      ]);

      if (strategyResult.success && strategyResult.data?.strategy) {
        const s = strategyResult.data.strategy;
        setPoolAmounts(s.poolAllocations);
        setSubAgentConfig(s.subAgents ?? []);
        setMarketplaceSummary(s.marketplace ?? null);
        setStrategyStatus(s.status);
      }

      if (poolsResult.success && poolsResult.data?.pools) {
        setQuickswapPools(poolsResult.data.pools);
      }

      if (canvasMode) {
        const statusResult = await fetchTradingStatus(canvasMode);
        if (statusResult.success && statusResult.data?.status.lastCycle) {
          const last = statusResult.data.status.lastCycle;
          setCycleOutcome(outcomeFromCycleSummary(last));
          setLastExecutedTxs(last.executedTransactions ?? []);
        }
      }

      setLoading(false);
    }

    void load();
  }, [router, sessionReady, canvasMode]);

  useEffect(() => {
    if (!hydrated || !canvasMode || !workspaceRef.current) {
      return;
    }
    if (defaultsAppliedFor === canvasMode) {
      return;
    }
    const hasStoredLayout =
      typeof window !== "undefined" &&
      !!localStorage.getItem(panelLayoutStorageKey(canvasMode));
    if (!hasStoredLayout) {
      const h = workspaceRef.current.clientHeight;
      updatePanel("protocol-allocation", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 280)),
      });
      updatePanel("legend", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 200)),
      });
      updatePanel("viz-info", {
        x: snapToGrid(24),
        y: snapToGrid(Math.max(24, h - 120)),
      });
    }
    setDefaultsAppliedFor(canvasMode);
  }, [hydrated, canvasMode, defaultsAppliedFor, updatePanel]);

  const setPosition = (id: PanelId) => (x: number, y: number) => {
    updatePanel(id, { x, y });
  };

  function openAgentResponse(input: {
    cycleId?: string | null;
    text?: string | null;
  }) {
    setLlmDialogCycleId(input.cycleId ?? null);
    setLlmDialogText(input.text ?? null);
    setLlmDialogOpen(true);
  }

  function openLatestAgentResponse() {
    openAgentResponse({
      cycleId: cycleOutcome?.cycleId ?? null,
      text: cycleOutcome?.llmResponse ?? cycleOutcome?.message ?? null,
    });
  }

  function openFeedAgentResponse(item: LiveTradingFeedItem) {
    openAgentResponse({
      cycleId: item.cycleId ?? null,
      text: item.llmResponse ?? item.detail,
    });
  }

  const canViewLatestAgent =
    cycleOutcome != null &&
    cycleOutcome.status !== "running" &&
    Boolean(cycleOutcome.llmResponse || cycleOutcome.message);

  const marketplaceEnabled = marketplaceSummary?.enabled ?? false;

  const cycleSpendSttWei = useMemo(() => {
    const cycleId = cycleOutcome?.cycleId;
    if (!cycleId) {
      return "0";
    }
    const amounts = feedItems
      .filter(
        (item) =>
          item.cycleId === cycleId &&
          item.status === "completed" &&
          item.marketplace?.amountSttWei,
      )
      .map((item) => item.marketplace!.amountSttWei);
    return sumSttWei(amounts);
  }, [feedItems, cycleOutcome?.cycleId]);

  return (
    <>
      <PageSubBar
        title={
          strategyStatus === "paused"
            ? isDemo
              ? "Demo Agent Network · paused"
              : "QuickSwap Agent Network · paused"
            : cycleActive
              ? isDemo
                ? "Demo Agent Network · cycle active"
                : "QuickSwap Agent Network · cycle active"
              : isDemo
                ? "Demo Agent Network"
                : "QuickSwap Agent Network"
        }
        badge={
          canvasMode ? (
            <div className="flex items-center gap-2">
              <AccountModeBadge mode={canvasMode} />
              {modeOverride ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  debug override
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        action={
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3">
              {marketplaceEnabled && (
                <Link
                  href={APP_ROUTES.explorer}
                  className="border border-[#00ff88]/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[#00ff88] transition-colors hover:bg-[#00ff88]/10"
                >
                  Marketplace
                </Link>
              )}
              {isDemo && (
                <Link
                  href={APP_ROUTES.explorer}
                  className="border border-violet-500 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-violet-500 transition-colors hover:bg-violet-500/10"
                >
                  Explorer
                </Link>
              )}
              {canViewLatestAgent ? (
                <button
                  type="button"
                  onClick={openLatestAgentResponse}
                  className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-foreground transition-colors hover:bg-muted/50"
                >
                  View agent
                </button>
              ) : null}
              {strategyStatus === "paused" ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Paused
                </span>
              ) : cycleActive ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#ea580c]">
                  Cycle running
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  Auto trading
                </span>
              )}
              {connected ? (
                <span
                  className={`font-mono text-[10px] ${
                    isDemo
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-[#16a34a]"
                  }`}
                >
                  {isDemo ? "fork · connected" : "live · connected"}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  connecting…
                </span>
              )}
            </div>
          </div>
        }
        backHref={APP_ROUTES.dashboard}
        backLabel="Back to dashboard"
      />

      {loading ? (
        <AgentsCanvasSkeleton />
      ) : (
      <div
        ref={workspaceRef}
        className="relative h-[calc(100vh-120px)] w-full overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }}
      >
        <PoolTradingCanvas
          canvasPools={canvasPools}
          routeCommand={displayRoute}
          accountMode={canvasMode ?? undefined}
          subAgentStatuses={subAgentStatuses}
          enabledSubAgentIds={enabledSubAgentIds}
          marketplaceEnabled={marketplaceEnabled}
          marketplaceTripCommands={marketplaceTripCommands}
        />

        <CanvasPortfolioBar
          portfolio={portfolio}
          isDemo={isDemo}
          marketplace={marketplaceSummary}
          cycleSpendSttWei={cycleSpendSttWei}
        />

        <DraggableGridPanel
          id="nodes-legend"
          title="Pool nodes"
          x={layouts["nodes-legend"].x}
          y={layouts["nodes-legend"].y}
          collapsed={layouts["nodes-legend"].collapsed}
          onPositionChange={setPosition("nodes-legend")}
          onToggleCollapsed={() => toggleCollapsed("nodes-legend")}
          containerRef={workspaceRef}
          width={520}
          contentClassName="py-2"
        >
          <PoolNodesLegend
            canvasPools={canvasPools}
            accountMode={canvasMode ?? undefined}
            marketplaceEnabled={marketplaceEnabled}
          />
        </DraggableGridPanel>

        <DraggableGridPanel
          id="live-trades"
          title={isDemo ? "Demo Trades" : "Live Trades"}
          x={layouts["live-trades"].x}
          y={layouts["live-trades"].y}
          collapsed={layouts["live-trades"].collapsed}
          onPositionChange={setPosition("live-trades")}
          onToggleCollapsed={() => toggleCollapsed("live-trades")}
          containerRef={workspaceRef}
          width={320}
          alignRight
          contentClassName="p-0"
        >
          {canvasMode ? (
            <AgentTradingFeed
              accountMode={canvasMode}
              items={feedItems}
              connected={connected}
              cycleActive={cycleActive}
              onViewAgentResponse={openFeedAgentResponse}
              className="max-h-[min(50vh,360px)] border-0 bg-transparent"
            />
          ) : null}
        </DraggableGridPanel>

        <DraggableGridPanel
          id="protocol-allocation"
          title="Pool Allocation"
          x={layouts["protocol-allocation"].x}
          y={layouts["protocol-allocation"].y}
          collapsed={layouts["protocol-allocation"].collapsed}
          onPositionChange={setPosition("protocol-allocation")}
          onToggleCollapsed={() => toggleCollapsed("protocol-allocation")}
          containerRef={workspaceRef}
          width={300}
        >
          <div className="space-y-3">
            {canvasPools.length === 0 ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                No pools in strategy.
              </p>
            ) : (
              canvasPools.map((pool) => (
                <div
                  key={pool.poolId}
                  className="flex items-center justify-between gap-3"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: pool.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                      {pool.label}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground/80">
                      {pool.pair}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-foreground">
                    {(pool.allocationAmount / 1_000_000).toFixed(0)}M
                  </span>
                </div>
              ))
            )}
          </div>
        </DraggableGridPanel>

        <DraggableGridPanel
          id="viz-info"
          title="Cycle execution"
          x={layouts["viz-info"].x}
          y={layouts["viz-info"].y}
          collapsed={layouts["viz-info"].collapsed}
          onPositionChange={setPosition("viz-info")}
          onToggleCollapsed={() => toggleCollapsed("viz-info")}
          containerRef={workspaceRef}
          width={320}
        >
          {canvasMode ? (
            <AgentCycleExecutionPanel
              accountMode={canvasMode}
              outcome={cycleOutcome}
              cycleActive={cycleActive}
              executedTransactions={lastExecutedTxs}
              subAgentStatuses={subAgentStatuses}
              onViewAgentResponse={openLatestAgentResponse}
            />
          ) : null}
        </DraggableGridPanel>
      </div>
      )}

      <AgentLlmResponseDialog
        open={llmDialogOpen}
        onOpenChange={setLlmDialogOpen}
        cycleId={llmDialogCycleId}
        initialText={llmDialogText}
        headline={isDemo ? "Demo agent response" : "Live agent response"}
      />
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsCanvasSkeleton />}>
      <AgentsPageContent />
    </Suspense>
  );
}
