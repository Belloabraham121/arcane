/**
 * Re-exports split chain definitions. LLM/agents use testnet; QuickSwap pools use mainnet.
 * @see ./somnia-chains.ts
 * @see ./quickswap.ts
 */
export {
  somniaAgentChain,
  somniaMainnetChain,
  somniaChain,
} from "./somnia-chains";
