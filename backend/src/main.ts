import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id";
import { errorHandlerMiddleware } from "./api/middleware/error-handler";
import { requestLoggerMiddleware } from "./api/middleware/request-logger";
import { healthRouter } from "./api/routes/health";
import { getServerEnv } from "./config/env";
import { logger } from "./shared/logger";

const app = express();

app.use(express.json());
app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(healthRouter);

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

const server = app.listen(port, () => {
  logger.info("Server started", {
    port,
    nodeEnv,
    logLevel: logger.level,
    routes: ["GET /health", "GET /api/v1/version"],
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
