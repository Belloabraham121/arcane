/**
 * One-time migration: account_mode enum + column on user table.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-account-mode
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

async function ensureAccountModeEnum(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "AccountMode" AS ENUM ('demo', 'live');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log("Ensured AccountMode enum");
}

async function ensureAccountModeColumn(): Promise<void> {
  const exists = await columnExists("user", "account_mode");
  if (exists) {
    console.log("user.account_mode already exists");
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "user"
      ADD COLUMN account_mode "AccountMode" NOT NULL DEFAULT 'live';
  `);
  console.log("Added user.account_mode (default live)");
}

async function main(): Promise<void> {
  await ensureAccountModeEnum();
  await ensureAccountModeColumn();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
