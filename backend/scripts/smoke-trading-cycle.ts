/**
 * Dev-only: run one full trading cycle for an active user.
 *
 * Usage:
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com --simulate --force
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com --fork --whale=0xRichAddress
 *
 * --simulate — in-memory balances + dry-run swaps (no chain).
 * --fork     — Anvil mainnet fork: fund agent via whale impersonation or anvil_deal, real fork txs.
 *              Start Anvil first (see npm run fork:anvil).
 */

import "dotenv/config";
import type { Address } from "viem";
import { isAddress } from "viem";
import { prisma } from "../src/infrastructure/postgres/client";
import { findUserByEmail } from "../src/services/auth/user.repository";
import { runTradingCycle } from "../src/services/agents/trading-runner.service";
import { listPoolsWithMetrics } from "../src/services/defi/quickswap/pool-metrics.service";
import {
  applyQuickSwapForkRpc,
  assertAnvilForkHealthy,
  ensureAnvilAutomine,
  fundAgentOnFork,
  mineAnvilBlock,
  readErc20Balance,
} from "../src/services/dev/anvil-fork.service";
import {
  buildSimulatedWalletBalances,
  resolvePoolsForAllocations,
} from "../src/services/dev/trading-simulation";
import { getQuickSwapBundle } from "../src/config/quickswap";

function parseArg(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag?.slice(prefix.length + 1);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
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

function poolAllocationsFromRows(
  rows: { poolId: string; amount: number }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.poolId] = row.amount;
  }
  return map;
}

async function printForkBalances(anvilRpc: string, wallet: Address): Promise<void> {
  const bundle = getQuickSwapBundle(5031);
  for (const token of bundle.tokens) {
    if (token.symbol === "WSOMI") {
      continue;
    }
    try {
      const bal = await readErc20Balance(anvilRpc, token.address, wallet);
      console.log(`  ${token.symbol}: ${bal.toString()} raw`);
    } catch {
      console.log(`  ${token.symbol}: (unreadable)`);
    }
  }
}

async function main() {
  const simulate = hasFlag("--simulate");
  const fork = hasFlag("--fork");
  const simulateSomnia = hasFlag("--simulate-somnia");
  const force = hasFlag("--force");

  if (simulate && fork) {
    throw new Error("Use either --simulate or --fork, not both");
  }

  const userId = await resolveUserId();

  await prisma.$connect();

  const strategy = await prisma.agentStrategy.findUnique({
    where: { userId },
    include: { poolAllocations: true, user: { select: { walletAddress: true } } },
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

  const poolAllocations = poolAllocationsFromRows(strategy.poolAllocations);
  const walletAddress = strategy.user.walletAddress as Address;

  const modeLabel = fork
    ? "FORK (Anvil impersonation / deal + real fork txs)"
    : simulate
      ? "SIMULATE (in-memory balances + dry-run)"
      : "LIVE (mainnet balances)";

  console.log("Running trading cycle (dev smoke)…");
  console.log("  userId:    ", userId);
  console.log("  strategy:  ", strategy.id);
  console.log("  wallet:    ", walletAddress);
  console.log("  pools:     ", strategy.poolAllocations.map((p) => p.poolId).join(", "));
  console.log("  mode:      ", modeLabel);

  if (fork) {
    const anvilRpc =
      parseArg("--rpc") ??
      process.env.ANVIL_RPC_URL ??
      "http://127.0.0.1:8545";

    try {
      await assertAnvilForkHealthy(anvilRpc);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    const whaleArg = parseArg("--whale") ?? process.env.ANVIL_WHALE_ADDRESS;
    if (whaleArg && !isAddress(whaleArg)) {
      throw new Error(`Invalid --whale address: ${whaleArg}`);
    }

    applyQuickSwapForkRpc(anvilRpc);
    await ensureAnvilAutomine(anvilRpc);
    console.log("  fork rpc:  ", anvilRpc);
    console.log("  whale:     ", whaleArg ?? "(auto — anvil_deal if no whale)");

    const funded = await fundAgentOnFork({
      anvilRpc,
      agentAddress: walletAddress,
      depositAmount: strategy.depositAmount,
      whaleAddress: whaleArg as Address | undefined,
    });

    console.log("  funded via:", funded.method, funded.whaleAddress ?? "");
    await mineAnvilBlock(anvilRpc, 1);
    console.log("  balances after fund:");
    await printForkBalances(anvilRpc, walletAddress);
  }

  if (simulate || fork) {
    console.log(
      "  somnia:    ",
      fork ? "testnet attestation (unchanged RPC)" : simulateSomnia ? "live" : "skipped",
    );
    console.log(
      "  openai:    ",
      process.env.OPENAI_API_KEY ? "enabled" : "MISSING — set OPENAI_API_KEY",
    );
  }

  const { pools: resolvedPools } = await resolvePoolsForAllocations(poolAllocations);

  let overrides = undefined;

  if (simulate) {
    overrides = {
      listPoolsWithMetrics: async () => {
        const live = await listPoolsWithMetrics();
        return resolvedPools.length > 0 ? resolvedPools : live;
      },
      getWalletBalances: async () =>
        buildSimulatedWalletBalances({
          walletAddress,
          depositAmount: strategy.depositAmount,
          poolAllocations,
          pools: resolvedPools,
        }),
      simulation: {
        dryRunTrades: true,
        skipSomniaAttestation: !simulateSomnia,
      },
      skipCycleCooldown: force || simulate,
    };
  } else if (fork) {
    overrides = {
      listPoolsWithMetrics: async () => {
        const live = await listPoolsWithMetrics();
        return resolvedPools.length > 0 ? resolvedPools : live;
      },
      skipCycleCooldown: true,
      simulation: {
        skipSomniaAttestation: !simulateSomnia,
      },
    };
  } else if (force) {
    overrides = { skipCycleCooldown: true };
  }

  const summary = await runTradingCycle(userId, "manual", overrides);

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
