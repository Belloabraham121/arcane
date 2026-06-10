import { defineChain } from "viem";

/** Somnia testnet — Somnia native agents (LLM inference, JSON API). Chain ID 50312, currency STT. */
export const somniaAgentChain = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://api.infra.testnet.somnia.network"],
      webSocket: ["wss://dream-rpc.somnia.network/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Shannon Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
});

/** Somnia mainnet — QuickSwap V4 pools and agent wallet swap execution. Chain ID 5031, currency SOMI. */
export const somniaMainnetChain = defineChain({
  id: 5031,
  name: "Somnia Mainnet",
  nativeCurrency: { name: "SOMI", symbol: "SOMI", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://api.infra.mainnet.somnia.network/"],
      webSocket: ["wss://api.infra.mainnet.somnia.network/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://explorer.somnia.network",
    },
  },
});

/**
 * @deprecated Prefer `somniaAgentChain` (LLM) or `somniaMainnetChain` (QuickSwap).
 * Kept for existing smoke scripts that target the Somnia agent platform on testnet.
 */
export const somniaChain = somniaAgentChain;
