/**
 * Adds `paused` to StrategyStatus enum on agent_strategy.
 *
 * Run before `prisma db push` when upgrading:
 *   npm run db:migrate-strategy-paused
 *   npm run db:generate
 *   prisma db push
 *
 * Safe to re-run (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'StrategyStatus' AND e.enumlabel = 'paused'
      ) THEN
        ALTER TYPE "StrategyStatus" ADD VALUE 'paused';
      END IF;
    END
    $$;
  `);
  console.log("Ensured StrategyStatus.paused enum value");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
