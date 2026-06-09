/**
 * Phase 6 migration: marketplace purchase cycle context + trading action type.
 *
 * Run BEFORE `npm run db:push`:
 *   npm run db:migrate-marketplace-phase6
 *   npm run db:push
 *
 * Safe to re-run (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(
  table: string,
  column: string,
): Promise<boolean> {
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

async function ensureMarketplacePurchaseStatusEnum(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'MarketplacePurchaseStatus'
      ) THEN
        CREATE TYPE "MarketplacePurchaseStatus" AS ENUM ('success', 'failed', 'skipped');
      END IF;
    END $$;
  `);
  console.log("Ensured MarketplacePurchaseStatus enum");
}

async function ensureMarketplacePurchaseColumns(): Promise<void> {
  const table = "marketplace_purchase";
  if (!(await columnExists(table, "cycle_id"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE marketplace_purchase
        ADD COLUMN cycle_id UUID
    `);
  }
  if (!(await columnExists(table, "sub_agent_id"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE marketplace_purchase
        ADD COLUMN sub_agent_id TEXT
    `);
  }
  if (!(await columnExists(table, "status"))) {
    await ensureMarketplacePurchaseStatusEnum();
    await prisma.$executeRawUnsafe(`
      ALTER TABLE marketplace_purchase
        ADD COLUMN status "MarketplacePurchaseStatus" NOT NULL DEFAULT 'success'
    `);
  }
  if (!(await columnExists(table, "metadata"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE marketplace_purchase
        ADD COLUMN metadata JSONB
    `);
  }
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_purchase_cycle_id
      ON marketplace_purchase (cycle_id)
  `);
  console.log("Ensured marketplace_purchase phase-6 columns");
}

async function ensureTradingActionMarketplaceType(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'TradingActionType'
          AND e.enumlabel = 'marketplace_purchase'
      ) THEN
        ALTER TYPE "TradingActionType" ADD VALUE 'marketplace_purchase';
      END IF;
    END $$;
  `);
  console.log("Ensured TradingActionType.marketplace_purchase");
}

async function main(): Promise<void> {
  await ensureMarketplacePurchaseColumns();
  await ensureTradingActionMarketplaceType();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
