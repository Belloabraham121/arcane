import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app";
import { prisma } from "../../src/infrastructure/postgres/client";
import { startTestServer } from "../helpers/http";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

describe("GET /api/v1/quickswap/pools", { skip: !runIntegration }) => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("returns at least one pool with metrics", async () => {
    const app = createApp();
    const server = await startTestServer(app);

    try {
      const response = await fetch(`${server.baseUrl}/api/v1/quickswap/pools`);
      assert.equal(response.status, 200);

      const body = (await response.json()) as {
        success: boolean;
        data: {
          pools: Array<{
            id: string;
            metrics: {
              totalValueLockedUsd: string | null;
              volumeUsd: string | null;
              liquidity: string;
            };
          }>;
        };
      };

      assert.equal(body.success, true);
      assert.ok(body.data.pools.length >= 1, "expected >= 1 pool");

      for (const pool of body.data.pools) {
        assert.ok(pool.id.length > 0);
        assert.ok(Number(pool.metrics.totalValueLockedUsd) > 0);
        assert.ok(Number(pool.metrics.volumeUsd) > 0);
        assert.ok(BigInt(pool.metrics.liquidity) > 0n);
      }
    } finally {
      await server.close();
    }
  });
});
