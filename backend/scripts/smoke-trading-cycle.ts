/**
 * Dev-only: run one full trading cycle for an active user.
 *
 * Usage:
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com --mode=demo
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com --mode=demo --fork --force
 *   npm run smoke:trading:cycle -- --email=you@signup-email.com --simulate --force
 *
 * --mode=demo|live — strategy row to use (defaults to the user's account_mode).
 * --simulate — in-memory balances + dry-run swaps (no chain).
 * --fork     — Anvil mainnet fork: fund agent via whale impersonation or anvil_deal, real fork txs.
 *              Start Anvil first (see npm run fork:anvil).
 */

import "dotenv/config";
import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { isAddress } from "viem";
import { getDemoEnv } from "../src/config/env";
import { prisma } from "../src/infrastructure/postgres/client";
import { findUserByEmail, findUserById } from "../src/services/auth/user.repository";
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

function parseAccountMode(): AccountMode | undefined {
  const raw = parseArg("--mode");
  if (raw === "demo" || raw === "live") {
    return raw;
  }
  if (raw) {
    throw new Error(`Invalid --mode=${raw} (use demo or live)`);
  }
  return undefined;
}

async function listEligibleUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      accountMode: true,
      agentStrategies: {
        select: {
          accountMode: true,
          status: true,
          depositAmount: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const eligible = users.flatMap((user) =>
    user.agentStrategies
      .filter(
        (strategy) =>
          strategy.status === "active" && (strategy.depositAmount ?? 0) > 0,
      )
      .map((strategy) => ({ user, strategy })),
  );

  if (eligible.length === 0) {
    console.error("No users with active strategy and depositAmount > 0.");
    return;
  }

  console.error("Eligible users (active strategy + deposit):");
  for (const { user, strategy } of eligible) {
    console.error(
      `  --email=${user.email} --mode=${strategy.accountMode}`,
    );
    console.error(`  --user-id=${user.id} --mode=${strategy.accountMode}`);
  }
}

async function resolveUserAndMode(): Promise<{
  userId: string;
  accountMode: AccountMode;
}> {
  const modeOverride = parseAccountMode();
  const userIdArg = parseArg("--user-id");

  if (userIdArg) {
    const user = await findUserById(userIdArg);
    if (!user) {
      throw new Error(`No user for id: ${userIdArg}`);
    }
    const accountMode = modeOverride ?? user.accountMode ?? "live";
    return { userId: user.id, accountMode };
  }

  const email = parseArg("--email");
  if (email) {
    if (email === "your@email.com" || email === "YOUR_SIGNUP_EMAIL") {
      throw new Error(
        "Replace the placeholder with the email you signed up with (see eligible users below).",
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      throw new Error(
        `No user for email: ${email}. Use an account that exists in this database.`,
      );
    }
    const accountMode = modeOverride ?? user.accountMode ?? "live";
    return { userId: user.id, accountMode };
  }

  throw new Error(
    "Pass --user-id=<uuid> or --email=<your-signup-email> (optional --mode=demo|live)",
  );
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

  const { userId, accountMode } = await resolveUserAndMode();

  await prisma.$connect();

  const strategy = await prisma.agentStrategy.findUnique({
    where: { userId_accountMode: { userId, accountMode } },
    include: { poolAllocations: true, user: { select: { walletAddress: true } } },
  });

  if (!strategy) {
    throw new Error(
      `No ${accountMode} agent strategy for user — complete setup for that mode first`,
    );
  }
  if (strategy.status !== "active") {
    throw new Error("Strategy must be active (status=active)");
  }
  if (strategy.depositAmount <= 0) {
    throw new Error("depositAmount must be > 0");
  }

  const poolAllocations = poolAllocationsFromRows(strategy.poolAllocations);
  const demoEnv = getDemoEnv();
  const walletAddress = (
    accountMode === "demo"
      ? demoEnv.agentWallet
      : strategy.user.walletAddress
  ) as Address;

  const modeLabel = fork
    ? "FORK (Anvil impersonation / deal + real fork txs)"
    : simulate
      ? "SIMULATE (in-memory balances + dry-run)"
      : accountMode === "demo"
        ? "DEMO (Anvil fork — use --fork for local Anvil)"
        : "LIVE (mainnet balances)";

  console.log("Running trading cycle (dev smoke)…");
  console.log("  userId:       ", userId);
  console.log("  accountMode:  ", accountMode);
  console.log("  strategy:     ", strategy.id);
  console.log("  wallet:       ", walletAddress);
  console.log(
    "  pools:        ",
    strategy.poolAllocations.map((p) => p.poolId).join(", "),
  );
  console.log("  mode:         ", modeLabel);

  if (fork || accountMode === "demo") {
    const anvilRpc = parseArg("--rpc") ?? demoEnv.anvilRpcUrl;

    try {
      await assertAnvilForkHealthy(anvilRpc);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (fork) {
      const whaleArg =
        parseArg("--whale") ??
        process.env.ANVIL_WHALE_ADDRESS ??
        demoEnv.forkWhale;
      if (whaleArg && !isAddress(whaleArg)) {
        throw new Error(`Invalid --whale address: ${whaleArg}`);
      }

      applyQuickSwapForkRpc(anvilRpc);
      await ensureAnvilAutomine(anvilRpc);
      console.log("  fork rpc:     ", anvilRpc);
      console.log("  whale:        ", whaleArg ?? "(auto — anvil_deal if no whale)");

      const funded = await fundAgentOnFork({
        anvilRpc,
        agentAddress: walletAddress,
        depositAmount: strategy.depositAmount,
        whaleAddress: whaleArg as Address | undefined,
      });

      console.log("  funded via:   ", funded.method, funded.whaleAddress ?? "");
      await mineAnvilBlock(anvilRpc, 1);
      console.log("  balances after fund:");
      await printForkBalances(anvilRpc, walletAddress);
    }
  }

  if (simulate || fork || accountMode === "demo") {
    console.log(
      "  somnia:       ",
      fork || accountMode === "demo"
        ? "testnet attestation (unchanged RPC)"
        : simulateSomnia
          ? "live"
          : "skipped",
    );
    console.log(
      "  openai:       ",
      process.env.OPENAI_API_KEY ? "enabled" : "MISSING — set OPENAI_API_KEY",
    );
  }

  const { pools: resolvedPools } = await resolvePoolsForAllocations(poolAllocations);

  let overrides = undefined;

  if (simulate) {
    overrides = {
      accountMode,
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
  } else if (fork || accountMode === "demo") {
    overrides = {
      accountMode,
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
    overrides = { accountMode, skipCycleCooldown: true };
  } else {
    overrides = { accountMode };
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
