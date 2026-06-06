import { Router } from "express";
import { getServerEnv } from "../../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: { status: "ok" },
    meta: { timestamp: new Date().toISOString() },
    error: null,
  });
});

healthRouter.get("/api/v1/version", (_req, res) => {
  const { apiDefaultVersion } = getServerEnv();
  res.json({
    success: true,
    data: { version: apiDefaultVersion },
    meta: { timestamp: new Date().toISOString() },
    error: null,
  });
});
