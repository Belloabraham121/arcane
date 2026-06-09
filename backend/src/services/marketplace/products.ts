import type { MarketplaceProductId } from "../../config/marketplace.js";
import { buildTradingRecommendation } from "../agents/trading-recommendations.js";
import type { MarketplaceUserContext } from "./marketplace-context.service.js";

export type PoolSnapshotProduct = {
  productId: "pools/snapshot";
  generatedAt: string;
  walletAddress: string;
  accountMode: string;
  pools: Array<{
    id: string;
    label: string;
    token0: string;
    token1: string;
    priceLabel: string | null;
    liquidity: string;
    feeTierPercent: number;
    feeAprPercent: number | null;
    tvlUsd: number | null;
    volumeUsd: number | null;
    targetPercent: number;
    currentPercent: number;
    driftPercent: number;
  }>;
};

export type SpreadSignalProduct = {
  productId: "signals/spread";
  generatedAt: string;
  signal: ReturnType<typeof buildTradingRecommendation>;
};

export type CrossChainAdvisoryProduct = {
  productId: "signals/cross-chain";
  generatedAt: string;
  advisoryOnly: true;
  bridgeProvider: "lifi-pending";
  summary: string;
  opportunities: Array<{
    sourceChain: string;
    targetChain: string;
    asset: string;
    estimatedApyDeltaBps: number;
    note: string;
  }>;
};

export function buildPoolSnapshotProduct(
  context: MarketplaceUserContext,
): PoolSnapshotProduct {
  const activeIds = new Set(context.activePoolIds);
  const driftByPool = new Map(
    context.poolDrift.map((entry) => [entry.poolId, entry]),
  );

  return {
    productId: "pools/snapshot",
    generatedAt: new Date().toISOString(),
    walletAddress: context.walletAddress,
    accountMode: context.accountMode,
    pools: context.pools
      .filter((pool) => activeIds.has(pool.id))
      .map((pool) => {
        const drift = driftByPool.get(pool.id);
        return {
          id: pool.id,
          label: pool.label,
          token0: `${pool.token0.symbol} (${pool.token0.address})`,
          token1: `${pool.token1.symbol} (${pool.token1.address})`,
          priceLabel: pool.metrics.priceLabel,
          liquidity: pool.metrics.liquidity,
          feeTierPercent: pool.metrics.feeTierPercent,
          feeAprPercent: pool.metrics.feeApr,
          tvlUsd: pool.metrics.totalValueLockedUsd,
          volumeUsd: pool.metrics.volumeUsd,
          targetPercent: drift?.targetPercent ?? 0,
          currentPercent: drift?.currentPercent ?? 0,
          driftPercent: drift?.driftPercent ?? 0,
        };
      }),
  };
}

export function buildSpreadSignalProduct(
  context: MarketplaceUserContext,
): SpreadSignalProduct {
  return {
    productId: "signals/spread",
    generatedAt: new Date().toISOString(),
    signal: buildTradingRecommendation({
      poolDrift: context.poolDrift,
      pools: context.pools,
      balances: context.balances,
      riskLimits: context.riskLimits,
      allocationMode: context.allocationMode,
      userId: context.userId,
      accountMode: context.accountMode,
      activePoolIds: context.activePoolIds,
    }),
  };
}

export function buildCrossChainAdvisoryProduct(): CrossChainAdvisoryProduct {
  return {
    productId: "signals/cross-chain",
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    bridgeProvider: "lifi-pending",
    summary:
      "Bridge Scout cross-chain routing is advisory only. No on-chain bridge execution is performed in v1.",
    opportunities: [
      {
        sourceChain: "somnia-testnet",
        targetChain: "base-sepolia",
        asset: "STT",
        estimatedApyDeltaBps: 120,
        note: "Illustrative yield spread for sub-agent context — verify before any future LI.FI integration.",
      },
      {
        sourceChain: "somnia-testnet",
        targetChain: "arbitrum-sepolia",
        asset: "STT",
        estimatedApyDeltaBps: 85,
        note: "Read-only signal; executor still operates QuickSwap on Somnia fork/mainnet only.",
      },
    ],
  };
}

export function buildMarketplaceProduct(
  productId: MarketplaceProductId,
  context: MarketplaceUserContext,
): PoolSnapshotProduct | SpreadSignalProduct | CrossChainAdvisoryProduct {
  switch (productId) {
    case "pools/snapshot":
      return buildPoolSnapshotProduct(context);
    case "signals/spread":
      return buildSpreadSignalProduct(context);
    case "signals/cross-chain":
      return buildCrossChainAdvisoryProduct();
    default: {
      const _exhaustive: never = productId;
      throw new Error(`Unknown marketplace product: ${_exhaustive}`);
    }
  }
}
