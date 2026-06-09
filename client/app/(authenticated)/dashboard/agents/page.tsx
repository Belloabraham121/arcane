"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountModeBadge } from "@/components/layout/account-mode-badge";
import { PageSubBar } from "@/components/layout/page-sub-bar";
import { AgentsCanvasSkeleton } from "@/components/skeletons/content-skeletons";
import { DraggableGridPanel } from "@/components/draggable-grid-panel";
import { AgentTradingFeed } from "@/components/agent-trading-feed";
import { PoolNodesLegend } from "@/components/pool-nodes-legend";
import { PoolTradingCanvas } from "@/components/pool-trading-canvas";
import { useTradingSocket } from "@/hooks/use-trading-socket";
import { fetchPools } from "@/lib/api/quickswap";
import type { QuickSwapPool } from "@/lib/api/quickswap-types";
import { getAgentStrategy } from "@/lib/api/strategy";
import type { AccountMode } from "@/lib/api/auth";
import { useSession } from "@/providers/session-provider";
import {
  DEFAULT_POOL_ALLOCATIONS,
  type PoolAllocations,
} from "@/lib/api/strategy-types";
import {
  largestResolvablePoolId,
  resolveStrategyCanvasPools,
} from "@/lib/pool-resolve";
import {
  idleRouteForPool,
  normalizePoolRouteCommand,
} from "@/lib/trading-feed-helpers";
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

export default function AgentsPage() {
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
  const [loading, setLoading] = useState(true);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { layouts, updatePanel, toggleCollapsed, hydrated } =
    usePanelLayout(canvasMode);
  const [defaultsAppliedFor, setDefaultsAppliedFor] = useState<
    AccountMode | null
  >(null);

  const canvasPools = useMemo(
    () => resolveStrategyCanvasPools(poolAmounts, quickswapPools),
    [poolAmounts, quickswapPools],
  );

  const idlePoolRoute = useMemo(() => {
    const poolId = largestResolvablePoolId(poolAmounts, quickswapPools);
    return idleRouteForPool(poolId);
  }, [poolAmounts, quickswapPools]);

  const { connected, feedItems, routeCommand, cycleActive } = useTradingSocket({
    accountMode: canvasMode ?? undefined,
    enabled: !loading && canvasMode != null,
    hydrateFromHistory: true,
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
        setPoolAmounts(strategyResult.data.strategy.poolAllocations);
      }

      if (poolsResult.success && poolsResult.data?.pools) {
        setQuickswapPools(poolsResult.data.pools);
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

  return (
    <>
      <PageSubBar
        title={
          cycleActive
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
          connected ? (
            <span
              className={`font-mono text-[10px] ${
                isDemo
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-[#16a34a]"
              }`}
            >
              {isDemo ? "fork" : "live"}
            </span>
          ) : undefined
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
                  <div className="min-w-0">
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
          title="Visualization"
          x={layouts["viz-info"].x}
          y={layouts["viz-info"].y}
          collapsed={layouts["viz-info"].collapsed}
          onPositionChange={setPosition("viz-info")}
          onToggleCollapsed={() => toggleCollapsed("viz-info")}
          containerRef={workspaceRef}
          width={280}
        >
          <div className="space-y-1 text-muted-foreground">
            <p>
              Real-time WebSocket feed from{" "}
              {isDemo ? "demo fork" : "mainnet"} trading cycles.
            </p>
            <p>Swaps and rebalances animate between pool nodes.</p>
            <p className="text-[10px]">
              Hold the grip icon to drag. Panels snap to the grid.
            </p>
          </div>
        </DraggableGridPanel>
      </div>
      )}
    </>
  );
}
