import type { CorsOptions } from "cors";
import { getAuthEnv, getServerEnv } from "../config/env";

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function createCorsOptions(): CorsOptions {
  const { corsOrigin } = getAuthEnv();
  const { nodeEnv } = getServerEnv();
  const allowed = new Set([corsOrigin, ...DEV_ORIGINS]);

  return {
    origin(origin, callback) {
      // Same-origin or non-browser requests (no Origin header)
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }

      if (nodeEnv === "development") {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  };
}
