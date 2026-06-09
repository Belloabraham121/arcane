import type { AccountMode } from "@prisma/client";
import type { Server } from "socket.io";
import { createLogger } from "../shared/logger";
import type { ToolExecutionOutcome } from "../services/somnia/quickswap-llm-tools";
import type { ExecutedTransaction } from "../services/agents/trading.types";
import {
  TRADING_SOCKET_EVENTS,
  type TradingActionExecutedEvent,
  type TradingCycleCompletedEvent,
  type TradingCycleStartedEvent,
} from "./trading-events.types";

const log = createLogger("trading-socket");

let io: Server | null = null;

export function setTradingSocketServer(server: Server): void {
  io = server;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function emitToUser<T>(userId: string, event: string, payload: T): void {
  if (!io) {
    return;
  }
  io.to(userRoom(userId)).emit(event, payload);
  log.debug("Trading socket event", { userId, event });
}

export function emitTradingCycleStarted(
  userId: string,
  payload: TradingCycleStartedEvent,
): void {
  emitToUser(userId, TRADING_SOCKET_EVENTS.cycleStarted, payload);
}

export function emitTradingActionExecuted(
  userId: string,
  payload: TradingActionExecutedEvent,
): void {
  emitToUser(userId, TRADING_SOCKET_EVENTS.actionExecuted, payload);
}

export function emitTradingCycleCompleted(
  userId: string,
  payload: TradingCycleCompletedEvent,
): void {
  emitToUser(userId, TRADING_SOCKET_EVENTS.cycleCompleted, payload);
}

function parseToolPools(
  tool: string,
  result: string,
): { poolFrom: string | null; poolTo: string | null } {
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    if (tool === "rebalanceToPool") {
      return {
        poolFrom:
          typeof parsed.fromPoolId === "string" ? parsed.fromPoolId : null,
        poolTo:
          typeof parsed.targetPoolId === "string"
            ? parsed.targetPoolId
            : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { poolFrom: null, poolTo: null };
}

export function emitFromToolOutcome(
  userId: string,
  cycleId: string,
  accountMode: AccountMode,
  outcome: ToolExecutionOutcome,
): void {
  const at = new Date().toISOString();
  const { poolFrom, poolTo } = parseToolPools(outcome.tool, outcome.result);

  if (outcome.executedTransactions && outcome.executedTransactions.length > 0) {
    for (const tx of outcome.executedTransactions) {
      emitTradingActionExecuted(userId, {
        cycleId,
        accountMode,
        type: tx.kind === "swap" ? "swap" : "approve",
        toolName: outcome.tool,
        poolFrom,
        poolTo,
        txHash: tx.hash,
        status: outcome.success ? "success" : "failed",
        at,
      });
    }
    return;
  }

  if (
    outcome.tool === "quoteSwap" ||
    outcome.tool === "listPools" ||
    outcome.tool === "getPortfolio"
  ) {
    return;
  }

  emitTradingActionExecuted(userId, {
    cycleId,
    accountMode,
    type: outcome.tool === "rebalanceToPool" ? "rebalance" : "tool",
    toolName: outcome.tool,
    poolFrom,
    poolTo,
    status: outcome.success ? "success" : "failed",
    at,
  });
}

export function emitFromExecutedTransactions(
  userId: string,
  cycleId: string,
  accountMode: AccountMode,
  txs: ExecutedTransaction[],
  context?: { poolFrom?: string | null; poolTo?: string | null },
): void {
  const at = new Date().toISOString();
  for (const tx of txs) {
    emitTradingActionExecuted(userId, {
      cycleId,
      accountMode,
      type: tx.kind,
      poolFrom: context?.poolFrom ?? null,
      poolTo: context?.poolTo ?? null,
      tokenIn: tx.tokenIn ?? null,
      tokenOut: tx.tokenOut ?? null,
      amountIn: tx.amountIn ?? null,
      amountOut: tx.amountOut ?? null,
      txHash: tx.hash,
      status: tx.status,
      at,
    });
  }
}
