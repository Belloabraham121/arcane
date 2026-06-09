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
import { tradingCyclesRouter } from "./api/routes/v1/trading/cycles";
import { portfolioSummaryRouter } from "./api/routes/v1/portfolio/summary";
import { walletBalancesRouter } from "./api/routes/v1/wallets/balances";
import { createCorsOptions } from "./config/cors";

/** Express app without DB connect, workers, or WebSocket (for tests and main entry). */
export function createApp() {
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
  app.use(tradingCyclesRouter);
  app.use(quickswapPoolsRouter);
  app.use(portfolioSummaryRouter);
  app.use(walletBalancesRouter);
  app.use(errorHandlerMiddleware);

  return app;
}
