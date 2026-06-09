/**
 * One-time migration: portfolio_snapshot table + baseline columns on agent_strategy.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-portfolio-snapshots
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

async function ensureBaselineColumns(): Promise<void> {
  const detected = await columnExists("agent_strategy", "detected_deposit_usd");
  if (detected) {
    console.log("agent_strategy baseline columns already exist");
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE agent_strategy
      ADD COLUMN IF NOT EXISTS detected_deposit_usd DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS baseline_usd DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS baseline_set_at TIMESTAMPTZ;
  `);
  console.log("Added agent_strategy baseline columns");
}

async function ensurePortfolioSnapshotTable(): Promise<void> {
  const exists = await tableExists("portfolio_snapshot");
  if (exists) {
    console.log("portfolio_snapshot table already exists");
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE portfolio_snapshot (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      account_mode "AccountMode" NOT NULL,
      wallet_address TEXT NOT NULL,
      total_value_usd DOUBLE PRECISION NOT NULL,
      balances_json JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshot_user_captured
      ON portfolio_snapshot (user_id, captured_at DESC)
  `);
  console.log("Created portfolio_snapshot table");
}

async function main(): Promise<void> {
  await ensureBaselineColumns();
  await ensurePortfolioSnapshotTable();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
