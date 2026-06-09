import "dotenv/config";
import {
  createTestClient,
  decodeErrorResult,
  http,
  publicActions,
  walletActions,
} from "viem";
import { quickSwapAdapter } from "../src/services/defi/quickswap/quickswap.adapter";
import { somniaMainnetChain } from "../src/config/somnia-chain";
import {
  getQuickSwapPublicClient,
  resetQuickSwapPublicClient,
} from "../src/services/defi/quickswap/client";
import {
  algebraPoolAbi,
  erc20MinimalAbi,
  swapRouterSomniaAbi,
} from "../src/services/defi/quickswap/abis";
import { getQuickSwapEnv } from "../src/config/env";
import { ZERO_DEPLOYER } from "../src/config/quickswap";

const WSOMI = "0x046EDe9564A72571df6F5e44d0405360c0f4dCab" as const;
const USDCe = "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00" as const;
const AGENT = "0xA4B8fEC2837AE227Fd64f344ef663c5a0bA4e46e" as const;

async function tryDirection(
  tokenIn: typeof WSOMI | typeof USDCe,
  tokenOut: typeof WSOMI | typeof USDCe,
  amountIn: bigint,
  label: string,
  rpc: string,
) {
  const { quote, swap } = await quickSwapAdapter.buildSwapExactInWithQuote(
    tokenIn,
    tokenOut,
    amountIn,
    AGENT,
    300,
  );
  const testClient = createTestClient({
    chain: somniaMainnetChain,
    mode: "anvil",
    transport: http(rpc),
  })
    .extend(publicActions)
    .extend(walletActions);
  await testClient.impersonateAccount({ address: AGENT });
  const { createWalletClient } = await import("viem");
  const wallet = createWalletClient({
    account: { address: AGENT, type: "json-rpc" },
    chain: somniaMainnetChain,
    transport: http(rpc),
  });
  await wallet.writeContract({
    address: tokenIn,
    abi: erc20MinimalAbi,
    functionName: "approve",
    args: [swap.router, amountIn],
  });
  const client = getQuickSwapPublicClient();
  const router = getQuickSwapEnv().contracts.swapRouter;
  try {
    const { result } = await client.simulateContract({
      address: router,
      abi: swapRouterSomniaAbi,
      functionName: "exactInputSingle",
      account: AGENT,
      args: [
        {
          tokenIn,
          tokenOut,
          deployer: ZERO_DEPLOYER,
          recipient: AGENT,
          deadline: swap.deadline,
          amountIn: swap.amountIn,
          amountOutMinimum: swap.amountOutMinimum,
          limitSqrtPrice: 0n,
        },
      ],
    });
    console.log(label, "OK out=", quote.amountOut, "sim=", result.toString());
  } catch (e) {
    const err = e as { shortMessage?: string; cause?: { data?: `0x${string}` }; data?: `0x${string}` };
    const revertData = err.cause?.data ?? err.data;
    let decoded = "";
    if (revertData) {
      try {
        decoded = JSON.stringify(
          decodeErrorResult({ abi: swapRouterSomniaAbi, data: revertData }),
        );
      } catch {
        decoded = revertData;
      }
    }
    console.log(label, "FAIL", err.shortMessage ?? e, decoded ? `revert=${decoded}` : "");
  }
  await testClient.stopImpersonatingAccount({ address: AGENT });
}

async function main() {
  process.env.QUICKSWAP_RPC_HTTP = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
  resetQuickSwapPublicClient();
  const rpc = process.env.QUICKSWAP_RPC_HTTP;
  const { algebraFactoryAbi } = await import("../src/services/defi/quickswap/abis");
  const client = getQuickSwapPublicClient();
  const factory = getQuickSwapEnv().contracts.algebraFactory;
  const pool = await client.readContract({
    address: factory,
    abi: algebraFactoryAbi,
    functionName: "poolByPair",
    args: [WSOMI, USDCe],
  });
  console.log("poolByPair(WSOMI,USDCe)=", pool);
  if (pool && pool !== "0x0000000000000000000000000000000000000000") {
    const [liq, plugin, globalState] = await Promise.all([
      client.readContract({
        address: pool,
        abi: algebraPoolAbi,
        functionName: "liquidity",
      }),
      client.readContract({
        address: pool,
        abi: algebraPoolAbi,
        functionName: "plugin",
      }).catch(() => "n/a"),
      client.readContract({
        address: pool,
        abi: algebraPoolAbi,
        functionName: "globalState",
      }),
    ]);
    console.log("pool liquidity=", liq.toString());
    console.log("pool plugin=", plugin);
    console.log("globalState price=", globalState[0].toString());
  }
  await tryDirection(WSOMI, USDCe, 10n ** 18n, "WSOMI->USDCe 1", rpc);
  await tryDirection(USDCe, WSOMI, 1_000_000n, "USDCe->WSOMI 1", rpc);
}

main().catch(console.error);
