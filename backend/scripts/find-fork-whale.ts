/**
 * Find an address on an Anvil mainnet fork with large USDCe balance (for --whale).
 *
 * Usage:
 *   anvil --fork-url https://api.infra.mainnet.somnia.network --chain-id 5031
 *   npm run fork:find-whale -- --candidates=0xabc...,0xdef...
 *   npm run fork:find-whale --  # uses built-in pool/router candidates
 */

import "dotenv/config";
import type { Address } from "viem";
import { getQuickSwapEnv } from "../src/config/env";
import {
  findWhaleCandidate,
  isAnvilForkRpc,
  readErc20Balance,
} from "../src/services/dev/anvil-fork.service";
import { getQuickSwapBundle } from "../src/config/quickswap";

function parseArg(prefix: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return flag?.slice(prefix.length + 1);
}

async function main() {
  const anvilRpc =
    parseArg("--rpc") ??
    process.env.ANVIL_RPC_URL ??
    "http://127.0.0.1:8545";

  if (!(await isAnvilForkRpc(anvilRpc))) {
    throw new Error(
      `RPC ${anvilRpc} is not an Anvil fork. Start: anvil --fork-url ${getQuickSwapEnv().rpcHttp} --chain-id 5031`,
    );
  }

  const minUsdce = BigInt(parseArg("--min-usdce") ?? "1000000000");
  const custom = parseArg("--candidates");
  const env = getQuickSwapEnv();
  const bundle = getQuickSwapBundle(env.chainId);

  const candidates: Address[] = custom
    ? (custom.split(",").map((s) => s.trim()) as Address[])
    : ([
        bundle.contracts.swapRouter,
        bundle.contracts.algebraFactory,
        bundle.contracts.quoterV2,
        bundle.contracts.positionManager,
        "0xd1f1f7b4354bd07e2035d95c12e3192017928054",
        "0x472d15fc21a3b286be58cacc05ba3bce260fece5",
      ] as Address[]);

  const whale = await findWhaleCandidate(anvilRpc, candidates, minUsdce);
  const usdce = bundle.tokens.find((t) => t.symbol === "USDCe");

  if (!whale || !usdce) {
    console.log("No whale found in candidates. Pass richer addresses:");
    console.log("  npm run fork:find-whale -- --candidates=0xRich1,0xRich2");
    for (const address of candidates) {
      try {
        const bal = await readErc20Balance(anvilRpc, usdce!.address, address);
        console.log(`  ${address} USDCe=${bal.toString()}`);
      } catch {
        console.log(`  ${address} (unreadable)`);
      }
    }
    process.exit(1);
  }

  const balance = await readErc20Balance(anvilRpc, usdce.address, whale);
  console.log("Whale candidate:");
  console.log(`  address: ${whale}`);
  console.log(`  USDCe:   ${balance.toString()}`);
  console.log("\nUse with:");
  console.log(`  npm run smoke:trading:cycle -- --email=... --fork --whale=${whale}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
