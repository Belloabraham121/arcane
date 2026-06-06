/**
 * One-time migration: trading_cycle + trading_action tables and worker columns.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-trading
 *   npm run db:push
 *
 * Safe to re-run (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function ensureWorkerColumns(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE agent_strategy
      ADD COLUMN IF NOT EXISTS cycle_interval_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS last_observed_balance_fingerprint TEXT;
  `);
  console.log("Ensured agent_strategy worker columns");
}

async function ensureTradingCycleTable(): Promise<void> {
  const exists = await tableExists("trading_cycle");
  if (exists) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TYPE "TradingCycleStatus" AS ENUM ('completed', 'failed');
  `).catch(() => {
    /* enum may already exist from prisma db push */
  });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE trading_cycle (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      strategy_id UUID NOT NULL REFERENCES agent_strategy(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status "TradingCycleStatus" NOT NULL DEFAULT 'completed',
      message TEXT NOT NULL,
      llm_pending BOOLEAN NOT NULL DEFAULT true,
      llm_response TEXT,
      llm_summary TEXT,
      pool_drift JSONB,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_trading_cycle_user_started
      ON trading_cycle (user_id, started_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_trading_cycle_strategy_id
      ON trading_cycle (strategy_id)
  `);
  console.log("Created trading_cycle table");
}

async function ensureTradingActionTable(): Promise<void> {
  const exists = await tableExists("trading_action");
  if (exists) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TYPE "TradingActionType" AS ENUM ('approve', 'swap', 'rebalance', 'quote', 'tool');
  `).catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TYPE "TradingActionStatus" AS ENUM ('success', 'failed', 'reverted');
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE trading_action (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cycle_id UUID NOT NULL REFERENCES trading_cycle(id) ON DELETE CASCADE,
      type "TradingActionType" NOT NULL,
      tool_name TEXT,
      token_in TEXT,
      token_out TEXT,
      amount_in TEXT,
      amount_out TEXT,
      pool_from TEXT,
      pool_to TEXT,
      tx_hash TEXT,
      status "TradingActionStatus" NOT NULL DEFAULT 'success',
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_trading_action_cycle_id
      ON trading_action (cycle_id)
  `);
  console.log("Created trading_action table");
}

async function main() {
  await ensureWorkerColumns();
  await ensureTradingCycleTable();
  await ensureTradingActionTable();
  console.log("Trading tables migration complete. Next: npm run db:push");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
