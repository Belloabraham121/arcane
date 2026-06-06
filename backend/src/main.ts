import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id";
import { errorHandlerMiddleware } from "./api/middleware/error-handler";
import { requestLoggerMiddleware } from "./api/middleware/request-logger";
import { healthRouter } from "./api/routes/health";
import { authRouter } from "./api/routes/v1/auth";
import { agentStrategyRouter } from "./api/routes/v1/agents/strategy";
import { agentTradingRouter } from "./api/routes/v1/agents/trading";
import { quickswapPoolsRouter } from "./api/routes/v1/quickswap/pools";
import { walletBalancesRouter } from "./api/routes/v1/wallets/balances";
import { getAuthEnv, getServerEnv } from "./config/env";
import { createCorsOptions } from "./config/cors";
import { prisma } from "./infrastructure/postgres/client";
import { logger } from "./shared/logger";

const app = express();

app.use(cors(createCorsOptions()));
app.use(express.json());
app.use(cookieParser());
app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(healthRouter);
app.use(authRouter);
app.use(agentStrategyRouter);
app.use(agentTradingRouter);
app.use(quickswapPoolsRouter);
app.use(walletBalancesRouter);

app.use(errorHandlerMiddleware);

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

  const server = app.listen(port, () => {
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
        "PATCH /api/v1/agents/strategy/sub-agents",
        "GET /api/v1/quickswap/pools",
        "GET /api/v1/quickswap/pools/:poolId",
        "GET /api/v1/quickswap/pools/:poolId/quote",
        "GET /api/v1/wallets/balances",
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
