/**
 * One-time migration: protocol_allocation / pool_allocations JSON → pool_allocation table.
 *
 * Run BEFORE `npm run db:push` when upgrading from the legacy schema:
 *   npm run db:migrate-pools
 *   npm run db:push
 *
 * Safe to re-run (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KNOWN_POOL_IDS = new Set(["usdce-wsomi", "usdce-weth", "wsomi-weth"]);

const DEFAULT_POOL_ALLOCATIONS: Record<string, number> = {
  "usdce-wsomi": 50_000_000,
  "usdce-weth": 30_000_000,
  "wsomi-weth": 25_000_000,
};

type JsonAllocRow = {
  id: string;
  pool_allocations: Record<string, number> | null;
};

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function ensurePoolAllocationTable(): Promise<void> {
  const exists = await tableExists("pool_allocation");
  if (exists) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE pool_allocation (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      strategy_id UUID NOT NULL REFERENCES agent_strategy(id) ON DELETE CASCADE,
      pool_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uk_pool_allocation_strategy_pool UNIQUE (strategy_id, pool_id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_pool_allocation_pool_id ON pool_allocation (pool_id)
  `);
  console.log("Created pool_allocation table");
}

async function ensureTradingColumns(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE agent_strategy
      ADD COLUMN IF NOT EXISTS trading_enabled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_cycle_at TIMESTAMPTZ;
  `);
}

async function upsertPoolRow(strategyId: string, poolId: string, amount: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO pool_allocation (id, strategy_id, pool_id, amount, created_at, updated_at)
    VALUES (gen_random_uuid(), ${strategyId}::uuid, ${poolId}, ${amount}, now(), now())
    ON CONFLICT (strategy_id, pool_id)
    DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
  `;
}

async function backfillFromJsonColumn(): Promise<number> {
  const hasJson = await columnExists("agent_strategy", "pool_allocations");
  if (!hasJson) {
    console.log("pool_allocations JSON column not present — skip JSON backfill");
    return 0;
  }

  const rows = await prisma.$queryRaw<JsonAllocRow[]>`
    SELECT id, pool_allocations
    FROM agent_strategy
    WHERE pool_allocations IS NOT NULL
  `;

  let count = 0;
  for (const row of rows) {
    const alloc = row.pool_allocations;
    if (!alloc || typeof alloc !== "object") {
      continue;
    }
    for (const [poolId, amount] of Object.entries(alloc)) {
      if (!KNOWN_POOL_IDS.has(poolId) || typeof amount !== "number") {
        continue;
      }
      await upsertPoolRow(row.id, poolId, amount);
      count += 1;
    }
  }

  console.log(`Backfilled ${count} pool allocation row(s) from JSON`);
  return count;
}

async function backfillDefaultsForEmptyStrategies(): Promise<number> {
  const strategies = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT s.id
    FROM agent_strategy s
    LEFT JOIN pool_allocation p ON p.strategy_id = s.id
    WHERE p.id IS NULL
  `;

  let count = 0;
  for (const strategy of strategies) {
    for (const [poolId, amount] of Object.entries(DEFAULT_POOL_ALLOCATIONS)) {
      await upsertPoolRow(strategy.id, poolId, amount);
      count += 1;
    }
  }

  if (count > 0) {
    console.log(`Seeded ${count} default pool allocation row(s)`);
  }
  return count;
}

async function setTradingEnabledAt(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE agent_strategy
    SET trading_enabled_at = COALESCE(trading_enabled_at, updated_at)
    WHERE status = 'active' AND trading_enabled_at IS NULL
  `;
}

async function main() {
  await ensureTradingColumns();
  await ensurePoolAllocationTable();
  await backfillFromJsonColumn();
  await backfillDefaultsForEmptyStrategies();
  await setTradingEnabledAt();

  const legacyProtocol = await tableExists("protocol_allocation");
  if (legacyProtocol) {
    console.log(
      "protocol_allocation table still exists — run `npm run db:push` to drop it and sync Prisma schema.",
    );
  }

  console.log("Pool allocation migration complete. Next: npm run db:push");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
