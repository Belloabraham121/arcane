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

async function listEligibleUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      agentStrategy: { select: { status: true, depositAmount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const eligible = users.filter(
    (user) =>
      user.agentStrategy?.status === "active" &&
      (user.agentStrategy.depositAmount ?? 0) > 0,
  );

  if (eligible.length === 0) {
    console.error("No users with active strategy and depositAmount > 0.");
    return;
  }

  console.error("Eligible users (active strategy + deposit):");
  for (const user of eligible) {
    console.error(`  --email=${user.email}`);
    console.error(`  --user-id=${user.id}`);
  }
}

async function resolveUserId(): Promise<string> {
  const userId = parseArg("--user-id");
  if (userId) {
    return userId;
  }

  const email = parseArg("--email");
  if (email) {
    if (email === "your@email.com") {
      throw new Error(
        "Replace your@email.com with the email you signed up with (see eligible users below).",
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error(
        `No user for email: ${email}. Use an account that exists in this database.`,
      );
    }
    return user.id;
  }

  throw new Error("Pass --user-id=<uuid> or --email=<your-signup-email>");
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
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    try {
      await prisma.$connect();
      await listEligibleUsers();
    } catch {
      // ignore secondary errors
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
