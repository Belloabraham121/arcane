/**
 * One-time migration: account_mode on agent_strategy (one strategy per user per mode).
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-strategy-account-mode
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

async function constraintExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = ${name}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function ensureStrategyAccountMode(): Promise<void> {
  const colExists = await columnExists("agent_strategy", "account_mode");
  if (!colExists) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agent_strategy
        ADD COLUMN account_mode "AccountMode" NOT NULL DEFAULT 'live'
    `);
    console.log("Added agent_strategy.account_mode (default live)");
  } else {
    console.log("agent_strategy.account_mode already exists");
  }

  const userUnique = await constraintExists("agent_strategy_user_id_key");
  if (userUnique) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agent_strategy DROP CONSTRAINT agent_strategy_user_id_key
    `);
    console.log("Dropped agent_strategy_user_id_key (one strategy per user)");
  }

  const compositeUnique = await constraintExists(
    "uk_agent_strategy_user_account_mode",
  );
  if (!compositeUnique) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agent_strategy
        ADD CONSTRAINT uk_agent_strategy_user_account_mode
        UNIQUE (user_id, account_mode)
    `);
    console.log("Added uk_agent_strategy_user_account_mode");
  } else {
    console.log("uk_agent_strategy_user_account_mode already exists");
  }
}

async function main(): Promise<void> {
  await ensureStrategyAccountMode();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
