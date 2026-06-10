/**
 * One-time migration: per-strategy x402 STT budget on agent_strategy.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-marketplace-budget
 *   npm run db:push
 *
 * Safe to re-run (idempotent).
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

async function main(): Promise<void> {
  const colExists = await columnExists(
    "agent_strategy",
    "sub_agent_x402_budget_stt_wei",
  );
  if (!colExists) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agent_strategy
        ADD COLUMN sub_agent_x402_budget_stt_wei BIGINT
    `);
    console.log("Added agent_strategy.sub_agent_x402_budget_stt_wei");
  } else {
    console.log("agent_strategy.sub_agent_x402_budget_stt_wei already exists");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
