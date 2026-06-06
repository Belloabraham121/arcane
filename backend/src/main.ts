import express from "express";
import { getServerEnv } from "./config/env";
import { healthRouter } from "./api/routes/health";

const app = express();

app.use(express.json());
app.use(healthRouter);

const { port, nodeEnv } = getServerEnv();

app.listen(port, () => {
  console.log(`Arcane backend listening on http://localhost:${port} (${nodeEnv})`);
  console.log(`  GET /health`);
  console.log(`  GET /api/v1/version`);
});
