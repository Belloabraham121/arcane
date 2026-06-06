import { Router } from "express";
import { getServerEnv } from "../../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  res.json({
    success: true,
    data: { status: "ok" },
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});

healthRouter.get("/api/v1/version", (req, res) => {
  const { apiDefaultVersion } = getServerEnv();
  res.json({
    success: true,
    data: { version: apiDefaultVersion },
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});
