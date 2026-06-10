/**
 * One-time migration: account_mode on trading_cycle.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-trading-account-mode
 *   npm run db:push
 *
 * Safe to re-run (idempotent). Existing rows default to `live`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function ensureTradingCycleAccountMode(): Promise<void> {
  const exists = await columnExists("trading_cycle", "account_mode");
  if (exists) {
    console.log("trading_cycle.account_mode already exists");
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE trading_cycle
      ADD COLUMN account_mode "AccountMode" NOT NULL DEFAULT 'live'
  `);
  console.log("Added trading_cycle.account_mode (default live)");
}

async function main(): Promise<void> {
  await ensureTradingCycleAccountMode();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
