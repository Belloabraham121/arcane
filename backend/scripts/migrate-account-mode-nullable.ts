/**
 * Allow account_mode NULL until user completes account-mode onboarding.
 *
 * Run BEFORE `npm run db:push` when upgrading:
 *   npm run db:migrate-account-mode-nullable
 *   npm run db:push
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "user" ALTER COLUMN account_mode DROP DEFAULT
  `).catch(() => {
    /* default may already be dropped */
  });

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "user" ALTER COLUMN account_mode DROP NOT NULL
  `);

  console.log("user.account_mode is nullable (existing rows unchanged)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
