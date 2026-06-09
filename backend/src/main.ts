import { createServer } from "node:http";
import { createApp } from "./app";
import { getAuthEnv, getServerEnv } from "./config/env";
import { prisma } from "./infrastructure/postgres/client";
import { logger } from "./shared/logger";
import { startTradingCycleWorker } from "./workers/trading-cycle.worker";
import { initTradingSocketServer } from "./websocket/socket-server";

const app = createApp();

const { port, nodeEnv } = getServerEnv();

function registerProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

registerProcessHandlers();

async function start() {
  await prisma.$connect();
  logger.info("Database connected");

  startTradingCycleWorker();

  const httpServer = createServer(app);
  initTradingSocketServer(httpServer);

  const server = httpServer.listen(port, () => {
    const { corsOrigin } = getAuthEnv();
    logger.info("Server started", {
      port,
      nodeEnv,
      logLevel: logger.level,
      corsOrigin,
      routes: [
        "GET /health",
        "GET /api/v1/version",
        "POST /api/v1/auth/register",
        "POST /api/v1/auth/login",
        "POST /api/v1/auth/logout",
        "GET /api/v1/auth/me",
        "GET /api/v1/agents/strategy",
        "PUT /api/v1/agents/strategy",
        "PATCH /api/v1/agents/strategy/pool-allocations",
        "GET /api/v1/agents/trading/status",
        "POST /api/v1/agents/trading/run-cycle",
        "POST /api/v1/trading/cycles",
        "GET /api/v1/agents/trading/history",
        "GET /api/v1/agents/trading/history/:id",
        "PATCH /api/v1/agents/strategy/sub-agents",
        "GET /api/v1/quickswap/pools",
        "GET /api/v1/quickswap/pools/:poolId",
        "GET /api/v1/quickswap/pools/:poolId/quote",
        "GET /api/v1/portfolio/summary",
        "GET /api/v1/wallets/balances",
        "WS  /socket.io (trading:cycle_started|action_executed|cycle_completed)",
      ],
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error("Port already in use", {
        port,
        hint: `Stop the other process: lsof -ti :${port} | xargs kill — or set PORT in .env`,
      });
      process.exit(1);
    }
    logger.error("Server failed to start", { message: err.message, stack: err.stack });
    throw err;
  });
}

start().catch((err) => {
  logger.error("Startup failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
