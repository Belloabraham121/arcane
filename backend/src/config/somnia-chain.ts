import { defineChain } from "viem";

/** Somnia testnet — override RPC via SOMNIA_RPC_HTTP in scripts. */
export const somniaChain = defineChain({
  id: Number(process.env.SOMNIA_CHAIN_ID ?? "50312"),
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.SOMNIA_RPC_HTTP ?? "https://api.infra.testnet.somnia.network"],
      webSocket: [
        process.env.SOMNIA_RPC_WS ??
          "wss://dream-rpc.somnia.network/ws",
      ],
    },
  },
});
