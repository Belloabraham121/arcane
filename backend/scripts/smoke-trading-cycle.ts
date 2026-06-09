/**
 * Dev-only: run one full trading cycle for an active user (live LLM + optional on-chain).
 *
 * Usage:
 *   npm run smoke:trading:cycle -- --user-id=<uuid>
 *   npm run smoke:trading:cycle -- --email=agent@arcane.dev
 *
 * Requires: active strategy, depositAmount > 0, Postgres, Somnia testnet STT on agent wallet.
 */

import "dotenv/config";
import { prisma } from "../src/infrastructure/postgres/client";
import { findUserByEmail } from "../src/services/auth/user.repository";
import { runTradingCycle } from "../src/services/agents/trading-runner.service";

function parseArg(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag?.slice(prefix.length + 1);
}

async function resolveUserId(): Promise<string> {
  const userId = parseArg("--user-id");
  if (userId) {
    return userId;
  }

  const email = parseArg("--email");
  if (email) {
    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error(`No user for email: ${email}`);
    }
    return user.id;
  }

  throw new Error("Pass --user-id=<uuid> or --email=<address>");
}

async function main() {
  const userId = await resolveUserId();

  await prisma.$connect();

  const strategy = await prisma.agentStrategy.findUnique({
    where: { userId },
    include: { poolAllocations: true },
  });

  if (!strategy) {
    throw new Error("User has no agent strategy");
  }
  if (strategy.status !== "active") {
    throw new Error("Strategy must be active (status=active)");
  }
  if (strategy.depositAmount <= 0) {
    throw new Error("depositAmount must be > 0");
  }

  console.log("Running trading cycle (dev smoke)…");
  console.log("  userId:   ", userId);
  console.log("  strategy: ", strategy.id);
  console.log("  pools:    ", strategy.poolAllocations.map((p) => p.poolId).join(", "));

  const summary = await runTradingCycle(userId, "manual");

  console.log("\nCycle completed:");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
