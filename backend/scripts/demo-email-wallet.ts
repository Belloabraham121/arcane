/**
 * Demo: same email always yields the same Somnia/EVM address.
 *
 *   npm run demo:wallet -- agent@arcane.dev
 *   npm run demo:wallet -- Agent@Arcane.dev   # same address (normalized)
 */

import "dotenv/config";
import { createPublicClient, formatEther, http } from "viem";
import { emailWalletService } from "../src/services/auth/email-wallet.service";
import { somniaChain } from "../src/config/somnia-chain";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run demo:wallet -- <email>");
    process.exit(1);
  }

  const derived = emailWalletService.deriveFromEmail(email);
  const record = emailWalletService.createWalletRecord(email);

  console.log("Email wallet (deterministic)");
  console.log("  email:           ", record.email);
  console.log("  address:         ", derived.address);
  console.log("  derivation path: ", derived.derivationPath);
  console.log("  encrypted at rest: yes (AES-256-GCM)");

  const rpc = process.env.SOMNIA_RPC_HTTP ?? "https://api.infra.testnet.somnia.network";
  const client = createPublicClient({ chain: somniaChain, transport: http(rpc) });
  const balance = await client.getBalance({ address: derived.address as `0x${string}` });
  console.log("  STT balance:     ", formatEther(balance), "STT");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
