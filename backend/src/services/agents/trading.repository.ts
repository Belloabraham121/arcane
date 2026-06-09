import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import type {
  ExecutedTransaction,
  PoolAllocationDrift,
  SomniaAttestationSummary,
  TradingCycleSummary,
  TradingToolAction,
} from "./trading.types";

export type TradingHistoryListItem = {
  id: string;
  accountMode: "demo" | "live";
  reason: string;
  status: string;
  message: string;
  llmPending: boolean;
  llmResponse: string | null;
  llmProvider: string | null;
  somniaAttestation: SomniaAttestationSummary | null;
  startedAt: string;
  finishedAt: string;
  actionCount: number;
};

export type TradingHistoryDetail = TradingHistoryListItem & {
  poolDrift: PoolAllocationDrift[];
  llmSummary: string | null;
  actions: TradingActionRecord[];
};

export type TradingActionRecord = {
  id: string;
  type: string;
  toolName: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
  amountIn: string | null;
  amountOut: string | null;
  poolFrom: string | null;
  poolTo: string | null;
  txHash: string | null;
  status: string;
  metadata: unknown;
  createdAt: string;
};

export type ActiveStrategyForWorker = {
  userId: string;
  strategyId: string;
  strategyType: string;
  accountMode: "demo" | "live";
  walletAddress: string;
  depositAmount: number;
  lastCycleAt: Date | null;
  tradingEnabledAt: Date | null;
  cycleIntervalMinutes: number | null;
  lastObservedBalanceFingerprint: string | null;
  poolIds: string[];
};

function mapActionType(
  tx: ExecutedTransaction,
): "approve" | "swap" {
  return tx.kind;
}

function parseSomniaAttestation(
  value: unknown,
): SomniaAttestationSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (
    status !== "submitted" &&
    status !== "success" &&
    status !== "failed" &&
    status !== "skipped"
  ) {
    return null;
  }
  return {
    status,
    requestId: typeof row.requestId === "string" ? row.requestId : null,
    txHash: typeof row.txHash === "string" ? row.txHash : null,
    onChainResponse:
      typeof row.onChainResponse === "string" ? row.onChainResponse : null,
    message: typeof row.message === "string" ? row.message : "",
  };
}

function summaryLlmProviderFromRow(row: {
  llmResponse: string | null;
}): string | null {
  return row.llmResponse ? "openai" : null;
}

export async function persistTradingCycle(
  summary: TradingCycleSummary,
  toolActions?: TradingToolAction[],
): Promise<void> {
  const actions: Prisma.TradingActionCreateWithoutCycleInput[] = [];

  for (const tx of summary.executedTransactions) {
    actions.push({
      type: mapActionType(tx),
      tokenIn: tx.tokenIn ?? null,
      tokenOut: tx.tokenOut ?? null,
      amountIn: tx.amountIn ?? null,
      amountOut: tx.amountOut ?? null,
      txHash: tx.hash,
      status: tx.status === "success" ? "success" : "reverted",
    });
  }

  if (summary.somniaAttestation?.txHash) {
    actions.push({
      type: "tool",
      toolName: "somnia_attestation",
      txHash: summary.somniaAttestation.txHash,
      status:
        summary.somniaAttestation.status === "failed" ? "failed" : "success",
      metadata: summary.somniaAttestation as Prisma.InputJsonValue,
    });
  }

  for (const tool of toolActions ?? []) {
    if (
      summary.executedTransactions.some((tx) => tool.result.includes(tx.hash))
    ) {
      continue;
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(tool.result) as Record<string, unknown>;
    } catch {
      parsed = { raw: tool.result };
    }

    const type =
      tool.tool === "rebalanceToPool"
        ? "rebalance"
        : tool.tool === "quoteSwap"
          ? "quote"
          : tool.tool === "swapExactIn"
            ? "swap"
            : "tool";

    actions.push({
      type,
      toolName: tool.tool,
      poolFrom:
        typeof parsed.fromPoolId === "string" ? parsed.fromPoolId : null,
      poolTo:
        typeof parsed.targetPoolId === "string"
          ? parsed.targetPoolId
          : null,
      amountIn:
        typeof parsed.amountIn === "string" ? parsed.amountIn : null,
      status: tool.success ? "success" : "failed",
      metadata: parsed as Prisma.InputJsonValue,
    });
  }

  await prisma.tradingCycle.create({
    data: {
      id: summary.cycleId,
      userId: summary.userId,
      strategyId: summary.strategyId,
      accountMode: summary.accountMode,
      reason: summary.reason,
      status: summary.phase === "failed" ? "failed" : "completed",
      message: summary.message,
      llmPending: summary.llmPending,
      llmResponse: summary.llmResponse ?? null,
      llmSummary: summary.llmResponse ?? summary.message,
      somniaAttestation: summary.somniaAttestation
        ? (summary.somniaAttestation as Prisma.InputJsonValue)
        : undefined,
      poolDrift: summary.poolDrift as Prisma.InputJsonValue,
      startedAt: new Date(summary.startedAt),
      finishedAt: new Date(summary.finishedAt),
      actions: {
        create: actions,
      },
    },
  });
}

export async function listTradingCycles(
  userId: string,
  page: number,
  limit: number,
): Promise<{ items: TradingHistoryListItem[]; total: number }> {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.tradingCycle.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { actions: true } },
      },
    }),
    prisma.tradingCycle.count({ where: { userId } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      accountMode: row.accountMode,
      reason: row.reason,
      status: row.status,
      message: row.message,
      llmPending: row.llmPending,
      llmResponse: row.llmResponse,
      llmProvider: summaryLlmProviderFromRow(row),
      somniaAttestation: parseSomniaAttestation(row.somniaAttestation),
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt.toISOString(),
      actionCount: row._count.actions,
    })),
    total,
  };
}

export async function getTradingCycleDetail(
  userId: string,
  cycleId: string,
): Promise<TradingHistoryDetail | null> {
  const row = await prisma.tradingCycle.findFirst({
    where: { id: cycleId, userId },
    include: {
      actions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    accountMode: row.accountMode,
    reason: row.reason,
    status: row.status,
    message: row.message,
    llmPending: row.llmPending,
    llmResponse: row.llmResponse,
    llmProvider: summaryLlmProviderFromRow(row),
    somniaAttestation: parseSomniaAttestation(row.somniaAttestation),
    llmSummary: row.llmSummary,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    actionCount: row.actions.length,
    poolDrift: (row.poolDrift as PoolAllocationDrift[] | null) ?? [],
    actions: row.actions.map((action) => ({
      id: action.id,
      type: action.type,
      toolName: action.toolName,
      tokenIn: action.tokenIn,
      tokenOut: action.tokenOut,
      amountIn: action.amountIn,
      amountOut: action.amountOut,
      poolFrom: action.poolFrom,
      poolTo: action.poolTo,
      txHash: action.txHash,
      status: action.status,
      metadata: action.metadata,
      createdAt: action.createdAt.toISOString(),
    })),
  };
}

export async function listActiveStrategiesForWorker(): Promise<
  ActiveStrategyForWorker[]
> {
  const rows = await prisma.agentStrategy.findMany({
    where: {
      status: "active",
      depositAmount: { gt: 0 },
    },
    include: {
      poolAllocations: true,
      user: { select: { id: true, walletAddress: true, accountMode: true } },
    },
  });

  return rows.map((row) => ({
    userId: row.user.id,
    strategyId: row.id,
    strategyType: row.strategyType,
    accountMode: row.user.accountMode,
    walletAddress: row.user.walletAddress,
    depositAmount: row.depositAmount,
    lastCycleAt: row.lastCycleAt,
    tradingEnabledAt: row.tradingEnabledAt,
    cycleIntervalMinutes: row.cycleIntervalMinutes,
    lastObservedBalanceFingerprint: row.lastObservedBalanceFingerprint,
    poolIds: row.poolAllocations
      .filter((allocation) => allocation.amount > 0)
      .map((allocation) => allocation.poolId),
  }));
}

export async function updateBalanceFingerprint(
  strategyId: string,
  fingerprint: string,
): Promise<void> {
  await prisma.agentStrategy.update({
    where: { id: strategyId },
    data: { lastObservedBalanceFingerprint: fingerprint },
  });
}
