/**
 * One-time migration: marketplace_purchase receipts table.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-marketplace-purchases
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
      WHERE table_schema = 'public'
        AND table_name = ${table}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function main(): Promise<void> {
  const exists = await tableExists("marketplace_purchase");
  if (exists) {
    console.log("marketplace_purchase already exists");
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE marketplace_purchase (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      amount_stt_wei BIGINT NOT NULL,
      tx_hash TEXT,
      payer_address TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX idx_marketplace_purchase_user_created
      ON marketplace_purchase (user_id, created_at DESC)
  `);
  console.log("Created marketplace_purchase");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
