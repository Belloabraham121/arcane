# ARCANE — Backend API & Protocol Reference

> Every external API, SDK, and protocol the Node.js backend needs to implement.  
> Organised by layer. Each entry includes: what it does in Arcane, docs link, install command, and key usage notes.

---

## Table of Contents

1. [Somnia Chain Infrastructure](#1-somnia-chain-infrastructure)
2. [Smart Account Layer — ERC-4337](#2-smart-account-layer--erc-4337)
3. [Agent Identity & Reputation — ERC-8004](#3-agent-identity--reputation--erc-8004)
4. [Signal Payments — x402](#4-signal-payments--x402)
5. [Somnia Reactivity](#5-somnia-reactivity)
6. [DeFi Protocol APIs](#6-defi-protocol-apis)
7. [Market Data APIs](#7-market-data-apis)
8. [LLM Providers](#8-llm-providers)
9. [Blockchain Libraries](#9-blockchain-libraries)
10. [Auth & Wallet Onboarding](#10-auth--wallet-onboarding)
11. [Storage — Agent Cards (IPFS)](#11-storage--agent-cards-ipfs)
12. [Backend Infrastructure (Node.js)](#12-backend-infrastructure-nodejs)

---

## 1. Somnia Chain Infrastructure

### Somnia RPC & Network

**Used for:** All on-chain interactions — contract calls, agent deployment, event subscriptions, transaction submission.

| Item               | Value                                              |
| ------------------ | -------------------------------------------------- |
| Docs               | https://docs.somnia.network/developer/network-info |
| Testnet RPC (HTTP) | `https://dream-rpc.somnia.network`                 |
| Testnet RPC (WS)   | `wss://dream-rpc.somnia.network`                   |
| Chain ID (Testnet) | `50312`                                            |
| Currency           | STT                                                |
| Block Explorer     | https://shannon-explorer.somnia.network            |
| Faucet             | https://testnet.somnia.network                     |

---

### Somnia Native Agents (JSON API / LLM Inference / Parse Website)

**Used for:** On-chain verifiable data fetching, routing decisions, signal generation, dispute evaluation.

| Item                        | Value                                        |
| --------------------------- | -------------------------------------------- |
| Docs                        | https://docs.somnia.network/developer/agents |
| Platform Contract (Testnet) | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| JSON API Agent ID           | `13174292974160097713`                       |
| LLM Agent ID                | See docs (Qwen3-30B)                         |
| Parse Website Agent ID      | See docs                                     |

```bash
# No npm package — interact directly via viem/ethers contract calls
# ABI available at: https://docs.somnia.network/developer/agents
```

**Key implementation pattern:**

```typescript
// Always calculate deposit correctly — underfunding causes silent timeout
const deposit =
  (await platform.getRequestDeposit()) +
  agentPricePerValidator * subcommitteeSize;

const requestId = await platform.createRequest({
  value: deposit,
  args: [agentId, callbackAddress, callbackSelector, payload],
});

// Always implement receive() in your callback contract for rebates
```

**Cost per call (subcommittee = 3):**

- JSON API Agent: `0.12 STT`
- LLM Inference: `0.24 STT`
- Parse Website: `0.33 STT`

---

## 2. Smart Account Layer — ERC-4337

Each Arcane agent is deployed as an ERC-4337 smart account. This gives agents their own on-chain address, batched transactions, and session key support for subagents.

### Pimlico — Bundler & Paymaster

**Used for:** Submitting agent UserOperations to the Somnia network. Paymaster covers gas from agent's STT balance.

| Item             | Value                                            |
| ---------------- | ------------------------------------------------ |
| Docs             | https://docs.pimlico.io                          |
| Bundler API Docs | https://docs.pimlico.io/bundler                  |
| Paymaster Docs   | https://docs.pimlico.io/paymaster                |
| GitHub           | https://github.com/pimlicolabs/permissionless.js |

```bash
npm install permissionless viem
```

```typescript
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({ transport: http(SOMNIA_RPC) });
const pimlicoClient = createPimlicoClient({ transport: http(BUNDLER_URL) });

const smartAccount = await toSimpleSmartAccount({
  client: publicClient,
  owner: agentEOA, // derived HD wallet
  entryPoint: { address: ENTRY_POINT_ADDRESS, version: "0.7" },
});

const smartAccountClient = createSmartAccountClient({
  account: smartAccount,
  chain: somniaTestnet,
  bundlerTransport: http(BUNDLER_URL),
  paymaster: pimlicoClient,
});

// Send a UserOperation
const txHash = await smartAccountClient.sendTransaction({
  to: QUICKSWAP_ROUTER,
  data: swapCalldata,
  value: 0n,
});
```

**Key endpoints:**

- `eth_sendUserOperation` — submit agent transaction
- `eth_getUserOperationReceipt` — check execution status
- `pm_sponsorUserOperation` — get paymaster signature

---

### Biconomy — Alternative Bundler (Fallback)

**Used for:** Fallback bundler if Pimlico unavailable on Somnia testnet.

| Item     | Value                        |
| -------- | ---------------------------- |
| Docs     | https://docs.biconomy.io     |
| SDK Docs | https://docs.biconomy.io/sdk |
| GitHub   | https://github.com/bcnmy/sdk |

```bash
npm install @biconomy/sdk
```

---

### Session Keys — Subagent Authorization

**Used for:** Issuing scoped permissions to subagent EOAs (YieldExecutor, BridgeScout, etc.) without exposing the root private key.

| Item                            | Value                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Pimlico Session Keys Docs       | https://docs.pimlico.io/permissionless/reference/smart-account-actions/grantPermission |
| ERC-7715 (Permissions Standard) | https://eips.ethereum.org/EIPS/eip-7715                                                |

```typescript
// Issue session key to subagent EOA
await smartAccountClient.grantPermission({
  permissions: [
    {
      type: "contract-call",
      data: {
        address: QUICKSWAP_ROUTER,
        functionSelector: SWAP_EXACT_INPUT_SELECTOR,
      },
      policies: [{ type: "gas-limit", data: { limit: 500_000n } }],
    },
  ],
  signer: subagentEOA,
});
```

---

## 3. Agent Identity & Reputation — ERC-8004

ERC-8004 is the Trustless Agents standard. Gives each Arcane agent a portable on-chain identity (ERC-721 NFT), a verifiable reputation record, and a validation registry for signal proofs.

### ERC-8004 Registry Contracts

**Used for:** Agent identity minting, reputation recording, signal validation proofs, agent discovery.

| Item                    | Value                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| EIP Spec                | https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098                      |
| GitHub (ERC PR)         | https://github.com/ethereum/ERCs/pull/1170                                            |
| Ledger Explainer        | https://www.ledger.com/academy/glossary/erc-8004                                      |
| QuickNode Guide         | https://blog.quicknode.com/erc-8004-a-developers-guide-to-trustless-ai-agent-identity |
| Awesome ERC-8004        | https://github.com/sudeepb02/awesome-erc8004                                          |
| Ethereum Mainnet Deploy | January 29, 2026 — deploy own instance on Somnia                                      |

```bash
# No official SDK yet — interact with registry contracts directly via viem
# Deploy your own ERC-8004 registry on Somnia (EVM-compatible)
# Reference implementation: https://github.com/ethereum/ERCs/pull/1170
```

**Three registries to deploy on Somnia:**

```typescript
// 1. Identity Registry — mint agent as ERC-721 with agent card URI
await identityRegistry.write.mintIdentity([
  agentSmartAccount,
  agentCardIpfsUri, // IPFS CID of agent card JSON
]);

// 2. Reputation Registry — record signal feedback after settlement
await reputationRegistry.write.recordFeedback([
  agentSmartAccount,
  signalId,
  FeedbackType.POSITIVE, // or NEGATIVE, DISPUTE_LOST
  evidenceBytes,
]);

// 3. Validation Registry — link signal to on-chain LLM proof
await validationRegistry.write.recordValidation([
  signalId,
  somniaAgentTxHash, // tx where on-chain LLM produced the signal
  somniaLLMOutputHash, // keccak256 of LLM output
]);
```

**Agent Card JSON schema (pinned to IPFS, referenced in ERC-721 metadata):**

```json
{
  "schemaVersion": "erc8004-v1",
  "name": "Arcane Agent #1047",
  "capabilities": ["yield-routing", "signal-generation"],
  "services": [
    {
      "type": "x402",
      "endpoint": "https://api.arcane.xyz/signals/0xABC.../latest",
      "priceUSDC": 0.05
    }
  ],
  "paymentAddress": "0xAgentSmartAccount...",
  "onChain": {
    "chain": "somnia",
    "chainId": 50312,
    "smartAccount": "0xAgentSmartAccount..."
  }
}
```

---

## 4. Signal Payments — x402

x402 is the HTTP-native micropayment protocol. Agents pay each other for signals with no wallet pop-ups, no subscriptions — pure HTTP + USDC.

### x402 Core SDK

**Used for:** Signal server paywall (seller side) and autonomous signal purchasing (buyer side).

| Item              | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| Website           | https://x402.org                                          |
| Docs              | https://docs.cdp.coinbase.com/x402                        |
| GitHub            | https://github.com/coinbase/x402                          |
| Buyer Quickstart  | https://docs.cdp.coinbase.com/x402/quickstart-for-buyers  |
| Seller Quickstart | https://docs.cdp.coinbase.com/x402/quickstart-for-sellers |
| Awesome x402      | https://github.com/xpaysh/awesome-x402                    |

```bash
# Server (signal seller)
npm install @x402/express @x402/core @x402/evm

# Client (signal buyer / agent)
npm install @x402/fetch @x402/core @x402/evm
```

**Seller — Express middleware (signal endpoint paywall):**

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { createEVMPaymentVerifier } from "@x402/evm";

const app = express();

app.use(
  paymentMiddleware(
    agentSmartAccountAddress, // payment recipient
    {
      "GET /signals/:agentAddress/latest": {
        price: "$0.05", // USDC
        network: "somnia",
        description: "Latest DeFi routing signal",
      },
    },
    createEVMPaymentVerifier(SOMNIA_RPC),
  ),
);

app.get("/signals/:agentAddress/latest", (req, res) => {
  // If we reach here, payment was verified
  res.json(getLatestSignal(req.params.agentAddress));
});
```

**Buyer — Agent autonomous payment:**

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEVMWalletSigner } from "@x402/evm";

const signer = createEVMWalletSigner(agentPrivateKey, SOMNIA_RPC);
const fetch402 = wrapFetchWithPayment(fetch, signer);

// Agent just calls fetch — x402 handles the 402 → sign → retry automatically
const signal = await fetch402(
  `https://api.arcane.xyz/signals/${sellerAddress}/latest`,
).then((r) => r.json());
```

**Budget policy (set per agent, not per call):**

```typescript
const budgetPolicy = {
    budgetUSDC: 2.0,            // total spend limit
    perCallLimitUSDC: 0.10,     // max per single signal
    providerWhitelist: [...],   // approved signal sellers
    ttlSeconds: 14400,          // 4-hour session
};
```

---

## 5. Somnia Reactivity

**Used for:** Automatic reputation settlement, live risk management, signal purchase notifications — all triggered on-chain without backend polling or keepers.

| Item                          | Value                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Docs                          | https://docs.somnia.network/developer/reactivity                                                 |
| What is Reactivity            | https://docs.somnia.network/developer/reactivity/what-is-reactivity                              |
| On-Chain Concepts             | https://docs.somnia.network/concepts/somnia-blockchain/on-chain-reactivity                       |
| Subscription Management       | https://docs.somnia.network/developer/reactivity/tooling/subscription-management                 |
| Solidity Tutorial             | https://docs.somnia.network/developer/reactivity/tutorials/solidity-on-chain-reactivity-tutorial |
| DEV.to Guide                  | https://dev.to/kalidecoder/somnia-on-chain-reactivity-2a2i                                       |
| Reactivity Precompile Address | `0x0100`                                                                                         |
| Min Funding (on-chain sub)    | `32 STT`                                                                                         |

```bash
npm install @somnia-chain/reactivity
```

**Off-chain subscription (backend agent runner):**

```typescript
import { createReactivitySDK } from "@somnia-chain/reactivity";

const sdk = createReactivitySDK({
  rpcUrl: "wss://dream-rpc.somnia.network",
});

// Backend listens for signals from watched agents
const sub = sdk.subscribe(
  {
    eventTopics: [SIGNAL_EMITTED_TOPIC],
    emitter: SIGNAL_MARKETPLACE_ADDRESS,
    stateOverrides: [
      {
        contract: REPUTATION_REGISTRY,
        fn: "computeReputationScore",
        args: (event) => [event.decoded.emitter],
      },
    ],
  },
  async ({ event, state }) => {
    const reputation = state[0];
    if (agentRunner.watchlist.includes(event.decoded.emitter)) {
      await agentRunner.evaluateSignalPurchase(event, reputation);
    }
  },
);

// Cleanup
sub.unsubscribe();
```

**On-chain subscription (Solidity — for ReputationSettler, RiskReactor):**

```typescript
import { SoliditySubscriptionData } from "@somnia-chain/reactivity";

const subData: SoliditySubscriptionData = {
  handlerContractAddress: REPUTATION_SETTLER_ADDRESS,
  eventTopics: [SIGNAL_EMITTED_TOPIC],
  emitter: SIGNAL_MARKETPLACE_ADDRESS,
  priorityFeePerGas: parseGwei("2"),
  maxFeePerGas: parseGwei("10"),
  gasLimit: 500_000n,
  isGuaranteed: true,
  isCoalesced: false,
};

const txHash = await sdk.createSoliditySubscription(subData);
```

**Subscription trigger types available:**

- `ContractEvent` — fires on matching event
- `BlockTick` — fires every N blocks
- `EpochTick` — fires every epoch
- `Schedule` — fires at a specific timestamp (used for signal settlement)

---

## 6. DeFi Protocol APIs

### QuickSwap V3 (AMM DEX — Live on Somnia)

**Used for:** Token swaps, liquidity provision, pool APY data.

| Item                 | Value                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| Docs                 | https://docs.quickswap.exchange                                         |
| Smart Contracts      | https://docs.quickswap.exchange/technical-reference/smart-contracts/v3  |
| API Reference        | https://docs.quickswap.exchange/technical-reference/api                 |
| SDK Reference        | https://docs.quickswap.exchange/technical-reference/sdk/getting-started |
| GitHub               | https://github.com/QuickSwap                                            |
| Subgraph (pool data) | https://docs.quickswap.exchange/technical-reference/api/api-overview    |

```bash
npm install @uniswap/v3-sdk @uniswap/sdk-core   # QuickSwap v3 is Uniswap v3 fork
```

**Key contract interactions:**

```typescript
// Swap via Router
router.exactInputSingle({
    tokenIn, tokenOut,
    fee: 3000,
    recipient: agentSmartAccount,
    amountIn,
    amountOutMinimum: quotedOut * 0.995n,  // 0.5% slippage
    sqrtPriceLimitX96: 0n
});

// Pool data via Subgraph (GraphQL)
const query = `{
    pools(orderBy: totalValueLockedUSD, orderDirection: desc, first: 10) {
        id token0 { symbol } token1 { symbol }
        feeTier totalValueLockedUSD volumeUSD
    }
}`;
```

---

### LI.FI (Cross-Chain Aggregator — Somnia Integration)

**Used for:** Best-route cross-chain bridging and swapping. Agent uses LI.FI API to find cheapest route, then executes.

| Item                    | Value                                          |
| ----------------------- | ---------------------------------------------- |
| Docs                    | https://docs.li.fi                             |
| SDK Overview            | https://docs.li.fi/sdk/overview                |
| REST API Docs           | https://docs.li.fi/li.fi-api/overview          |
| Agent Integration Guide | https://docs.li.fi/li.fi-api/agent-integration |
| API Base URL            | `https://li.quest/v1`                          |
| GitHub (SDK)            | https://github.com/lifinance/sdk               |

```bash
npm install @lifi/sdk
```

```typescript
import { createConfig, getRoutes, executeRoute } from "@lifi/sdk";

createConfig({ integrator: "arcane" });

// Get best cross-chain route
const routes = await getRoutes({
  fromChainId: SOMNIA_CHAIN_ID,
  toChainId: BASE_CHAIN_ID,
  fromTokenAddress: USDC_ON_SOMNIA,
  toTokenAddress: USDC_ON_BASE,
  fromAmount: "1000000000", // 1000 USDC (6 decimals)
  fromAddress: agentSmartAccount,
});

// Execute the best route
await executeRoute(routes.routes[0], {
  updateRouteHook: (route) => console.log("Route update:", route.steps),
});
```

**Key REST endpoints:**

```
GET /v1/quote          → get single best route quote
GET /v1/routes         → get multiple route options
GET /v1/status         → check bridge tx status
GET /v1/chains         → list supported chains
GET /v1/tokens         → list tokens per chain
```

---

### Jumper (Cross-Chain — Live on Somnia)

**Used for:** Alternative bridge route when competing with LI.FI. Agent picks best rate dynamically.

| Item   | Value                                                                                 |
| ------ | ------------------------------------------------------------------------------------- |
| Docs   | https://docs.jumper.exchange                                                          |
| GitHub | https://github.com/lifinance/jumper.exchange                                          |
| Note   | Jumper is built on LI.FI infrastructure — use LI.FI SDK, specify Jumper as integrator |

```typescript
// Jumper uses LI.FI API — just change the integrator name
createConfig({ integrator: "jumper" });
```

---

### Standard Protocol (Perps + CLOB — Live on Somnia)

**Used for:** Opening and managing leveraged perpetual positions. Signal agents monitor funding rates here.

| Item    | Value                                                   |
| ------- | ------------------------------------------------------- |
| Website | https://standardprotocol.org                            |
| Docs    | https://docs.standardprotocol.org                       |
| Note    | Verify Somnia-specific contract addresses in their docs |

```typescript
// Key data to fetch for signal generation
const fundingRate = await standardProtocol.getFundingRate(market);
const openInterest = await standardProtocol.getOpenInterest(market);
const markPrice = await standardProtocol.getMarkPrice(market);
```

---

### DreamDEX (CLOB DEX — Coming Soon on Somnia)

**Used for:** Limit orders, market making, zero-fee execution.

| Item    | Value                                                     |
| ------- | --------------------------------------------------------- |
| Website | https://dreamdex.io                                       |
| Note    | Coming soon on Somnia — monitor docs for API availability |

---

### Palmera (Safe Multisig — Live on Somnia)

**Used for:** Optional user-defined spending guardrails on agent smart accounts. Users who want human-in-the-loop for large moves.

| Item                  | Value                                 |
| --------------------- | ------------------------------------- |
| Docs                  | https://docs.palmera.finance          |
| Safe SDK (underlying) | https://docs.safe.global/sdk/overview |

```bash
npm install @safe-global/protocol-kit @safe-global/api-kit
```

---

## 7. Market Data APIs

### CoinGecko API

**Used for:** Token prices, market caps, historical data for signal context and reputation settlement price verification.

| Item      | Value                                             |
| --------- | ------------------------------------------------- |
| Docs      | https://docs.coingecko.com/reference/introduction |
| Free tier | 30 calls/min (no key required for basic)          |
| Pro API   | https://www.coingecko.com/en/api/pricing          |

```bash
npm install coingecko-api-v3
# or just use fetch directly
```

```typescript
// Get SOMI price
const res = await fetch(
  "https://api.coingecko.com/api/v3/simple/price?ids=somnia-network&vs_currencies=usd",
);
// → { "somnia-network": { "usd": 0.42 } }

// Get historical price at specific timestamp (for signal settlement)
const history = await fetch(
  `https://api.coingecko.com/api/v3/coins/${tokenId}/history?date=${dd - mm - yyyy}`,
);
```

---

### DexScreener API

**Used for:** Real-time DEX pair data — price, volume, liquidity, recent trades. Primary data source for Signal Scout subagent.

| Item      | Value                                      |
| --------- | ------------------------------------------ |
| Docs      | https://docs.dexscreener.com/api/reference |
| Free tier | No auth required for basic endpoints       |
| Base URL  | `https://api.dexscreener.com`              |

```typescript
// Get pairs for Somnia chain
const pairs = await fetch(
  "https://api.dexscreener.com/latest/dex/chains/somnia",
).then((r) => r.json());

// Search specific pair
const pair = await fetch(
  `https://api.dexscreener.com/latest/dex/pairs/somnia/${pairAddress}`,
).then((r) => r.json());
```

---

### DefiLlama API

**Used for:** TVL data, protocol yields, chain-level analytics. Used by Root Agent for macro context.

| Item      | Value                          |
| --------- | ------------------------------ |
| Docs      | https://defillama.com/docs/api |
| Base URL  | `https://api.llama.fi`         |
| Free tier | Fully free, no auth            |

```typescript
// Chain TVL
GET https://api.llama.fi/v2/historicalChainTvl/somnia

// Protocol yields
GET https://yields.llama.fi/pools
```

---

### Chainspect (Somnia On-Chain Analytics)

**Used for:** Somnia-specific chain health metrics — TPS, active addresses, gas price. Fed into signal context.

| Item    | Value                                                                       |
| ------- | --------------------------------------------------------------------------- |
| Website | https://chainspect.app/chain/somnia                                         |
| Note    | No public API — use Somnia Parse Website Agent to scrape this page on-chain |

---

## 8. LLM Providers

### Anthropic — Claude (Root Agent)

**Used for:** Root Agent orchestration — high-level strategy reasoning, portfolio decisions, signal buy/sell evaluation.

| Item              | Value                                                           |
| ----------------- | --------------------------------------------------------------- |
| Docs              | https://docs.anthropic.com                                      |
| API Reference     | https://docs.anthropic.com/en/api/getting-started               |
| Models Page       | https://docs.anthropic.com/en/docs/about-claude/models/overview |
| Recommended Model | `claude-sonnet-4-6` (current Sonnet)                            |

```bash
npm install @anthropic-ai/sdk
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const decision = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: rootAgentSystemPrompt,
  messages: [
    ...conversationHistory,
    { role: "user", content: JSON.stringify(marketData) },
  ],
});
```

---

### OpenAI — GPT-4o-mini (Subagents)

**Used for:** Signal Scout, Yield Executor, Risk Manager, Bridge Scout — fast, cheap, narrow-task LLMs.

| Item              | Value                                               |
| ----------------- | --------------------------------------------------- |
| Docs              | https://platform.openai.com/docs                    |
| API Reference     | https://platform.openai.com/docs/api-reference      |
| Models            | https://platform.openai.com/docs/models             |
| Recommended Model | `gpt-4o-mini` (subagents), `gpt-4o` (fallback root) |

```bash
npm install openai
```

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const scan = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: signalScoutSystemPrompt },
    { role: "user", content: JSON.stringify(protocolData) },
  ],
  response_format: { type: "json_object" },
});
```

---

## 9. Blockchain Libraries

### viem (Primary — Recommended)

**Used for:** All Somnia contract interactions — reading state, encoding calldata, sending transactions, event decoding.

| Item                  | Value                                       |
| --------------------- | ------------------------------------------- |
| Docs                  | https://viem.sh                             |
| Getting Started       | https://viem.sh/docs/getting-started        |
| Contract Interactions | https://viem.sh/docs/contract/writeContract |
| GitHub                | https://github.com/wevm/viem                |

```bash
npm install viem
```

```typescript
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const publicClient = createPublicClient({
  transport: http("https://dream-rpc.somnia.network"),
});

const account = privateKeyToAccount(agentPrivateKey);
const walletClient = createWalletClient({
  account,
  transport: http("https://dream-rpc.somnia.network"),
});

// Read contract
const score = await publicClient.readContract({
  address: REPUTATION_REGISTRY_ADDRESS,
  abi: reputationABI,
  functionName: "computeReputationScore",
  args: [agentAddress],
});

// Write contract
const txHash = await walletClient.writeContract({
  address: AGENT_REGISTRY_ADDRESS,
  abi: registryABI,
  functionName: "register",
  args: [smartAccount, AgentMode.HYBRID, signalPrice, true],
});
```

---

### ethers.js v6 (Alternative)

**Used for:** HD wallet derivation (BIP-44 agent address generation). More mature BIP-32/44 support than viem.

| Item      | Value                                               |
| --------- | --------------------------------------------------- |
| Docs      | https://docs.ethers.org/v6                          |
| HD Wallet | https://docs.ethers.org/v6/api/wallet/#HDNodeWallet |

```bash
npm install ethers
```

```typescript
import { HDNodeWallet, Mnemonic } from "ethers";

// Derive agent wallet from master mnemonic (stored in KMS)
const master = HDNodeWallet.fromPhrase(masterMnemonic);
const agentWallet = master.derivePath(`m/44'/60'/${userIndex}'/0/0`);

console.log(agentWallet.address); // deterministic agent address
console.log(agentWallet.privateKey); // use in-memory, never persist
```

---

### Coinbase CDP SDK (Agent Wallets)

**Used for:** Alternative to raw HD derivation for managed agent wallets. CDP Server Wallets integrate natively with x402 buyer flow.

| Item           | Value                                              |
| -------------- | -------------------------------------------------- |
| Docs           | https://docs.cdp.coinbase.com                      |
| Node.js SDK    | https://docs.cdp.coinbase.com/cdp-sdk/docs/welcome |
| Server Wallets | https://docs.cdp.coinbase.com/cdp-sdk/docs/wallets |

```bash
npm install @coinbase/cdp-sdk
```

---

## 10. Auth & Wallet Onboarding

### Privy

**Used for:** User authentication and wallet creation. Handles MetaMask, social login, embedded wallets — no custom auth required.

| Item                  | Value                                            |
| --------------------- | ------------------------------------------------ |
| Docs                  | https://docs.privy.io                            |
| Server Auth (backend) | https://docs.privy.io/guide/server/authorization |
| Node.js SDK           | https://docs.privy.io/guide/server               |

```bash
npm install @privy-io/server-auth
```

```typescript
import { PrivyClient } from "@privy-io/server-auth";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

// Verify user auth token from frontend
const { userId, user } = await privy.verifyAuthToken(authToken);

// Get user's wallet address
const walletAddress = user.wallet?.address;
```

---

## 11. Storage — Agent Cards (IPFS)

### Pinata (IPFS Pinning)

**Used for:** Storing ERC-8004 Agent Card JSON files. Agent card URI is the NFT metadata reference in the identity registry.

| Item          | Value                                                |
| ------------- | ---------------------------------------------------- |
| Docs          | https://docs.pinata.cloud                            |
| API Reference | https://docs.pinata.cloud/api-reference/introduction |
| Pricing       | Free tier: 1GB storage, 100 requests/month           |

```bash
npm install pinata
```

```typescript
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

// Pin agent card JSON
const upload = await pinata.upload.json(agentCard);
const ipfsUri = `ipfs://${upload.IpfsHash}`;
// Use ipfsUri as ERC-721 tokenURI in identity registry
```

---

## 12. Backend Infrastructure (Node.js)

### Express.js — HTTP Server

**Used for:** REST API, x402 signal server, agent management endpoints.

| Item | Value                                |
| ---- | ------------------------------------ |
| Docs | https://expressjs.com/en/4x/api.html |

```bash
npm install express
npm install -D @types/express
```

---

### BullMQ — Agent Loop Job Queue

**Used for:** Scheduling and managing agent LLM loop executions. Each agent gets recurring jobs: Root Agent cycle (5min), Signal Scout (60s), Risk Manager (30s).

| Item   | Value                                 |
| ------ | ------------------------------------- |
| Docs   | https://docs.bullmq.io                |
| GitHub | https://github.com/taskforcesh/bullmq |

```bash
npm install bullmq ioredis
```

```typescript
import { Queue, Worker } from "bullmq";

const agentQueue = new Queue("agent-cycles", { connection: redisConfig });

// Schedule recurring agent cycle
await agentQueue.add(
  "root-agent-cycle",
  { agentAddress },
  {
    repeat: { every: 5 * 60 * 1000 }, // every 5 minutes
  },
);

// Worker processes jobs
const worker = new Worker(
  "agent-cycles",
  async (job) => {
    await agentRunner.runCycle(job.data.agentAddress);
  },
  { connection: redisConfig },
);
```

---

### Prisma — ORM (PostgreSQL)

**Used for:** Agent state, signal history, decision log, reputation records, signal purchase history.

| Item            | Value                                      |
| --------------- | ------------------------------------------ |
| Docs            | https://www.prisma.io/docs                 |
| Getting Started | https://www.prisma.io/docs/getting-started |

```bash
npm install prisma @prisma/client
npx prisma init
```

---

### ioredis — Redis Client

**Used for:** Live agent metrics cache, WebSocket state, agent loop coordination.

| Item   | Value                            |
| ------ | -------------------------------- |
| Docs   | https://redis.github.io/ioredis  |
| GitHub | https://github.com/redis/ioredis |

```bash
npm install ioredis
```

---

### Socket.IO — WebSocket (Frontend Live Feed)

**Used for:** Pushing live agent state to the frontend visualiser — agent positions, signal events, reputation updates.

| Item       | Value                                |
| ---------- | ------------------------------------ |
| Docs       | https://socket.io/docs/v4            |
| Server API | https://socket.io/docs/v4/server-api |

```bash
npm install socket.io
```

---

### Zod — Schema Validation

**Used for:** Validating all incoming API requests, LLM JSON outputs, signal payloads.

| Item | Value           |
| ---- | --------------- |
| Docs | https://zod.dev |

```bash
npm install zod
```

---

### Winston — Logging

**Used for:** Structured agent decision logging, error tracking, audit trail.

| Item | Value                                |
| ---- | ------------------------------------ |
| Docs | https://github.com/winstonjs/winston |

```bash
npm install winston
```

---

## Quick Install — All Backend Dependencies

```bash
# Core chain
npm install viem ethers @somnia-chain/reactivity permissionless

# x402
npm install @x402/express @x402/fetch @x402/core @x402/evm

# DeFi protocols
npm install @lifi/sdk

# LLMs
npm install @anthropic-ai/sdk openai

# Coinbase
npm install @coinbase/cdp-sdk

# Auth
npm install @privy-io/server-auth

# Storage
npm install pinata

# Backend infra
npm install express bullmq ioredis @prisma/client socket.io zod winston dotenv

# Dev
npm install -D typescript @types/node @types/express ts-node nodemon prisma
```

---

## Environment Variables Checklist

```env
# Somnia
SOMNIA_RPC_HTTP=https://dream-rpc.somnia.network
SOMNIA_RPC_WS=wss://dream-rpc.somnia.network
SOMNIA_CHAIN_ID=50312

# Contracts (deploy and fill in)
AGENT_REGISTRY_ADDRESS=
SIGNAL_MARKETPLACE_ADDRESS=
REPUTATION_REGISTRY_ADDRESS=
IDENTITY_REGISTRY_ADDRESS=
VALIDATION_REGISTRY_ADDRESS=
REPUTATION_SETTLER_ADDRESS=
SOMNIA_AGENT_PLATFORM=0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776

# ERC-4337 Bundler
PIMLICO_API_KEY=
BUNDLER_URL=

# LLMs
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# x402
X402_FACILITATOR_URL=https://facilitator.cdp.coinbase.com

# Coinbase
CDP_API_KEY_NAME=
CDP_API_KEY_PRIVATE_KEY=

# Auth
PRIVY_APP_ID=
PRIVY_APP_SECRET=

# Storage
PINATA_JWT=
PINATA_GATEWAY=

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/arcane
REDIS_URL=redis://localhost:6379

# Master wallet (store in KMS — not plaintext)
# AWS_KMS_KEY_ID=arn:aws:kms:...
# MASTER_MNEMONIC_SECRET_ARN=arn:aws:secretsmanager:...

# APIs
COINGECKO_API_KEY=        # optional, increases rate limit
LIFI_INTEGRATOR_ID=arcane
```

---

_Last updated: Arcane — Encode Club Agentathon 2026_
