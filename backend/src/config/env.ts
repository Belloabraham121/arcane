import "dotenv/config";
import type { Address } from "viem";
import {
  QUICKSWAP_MAINNET_BUNDLE,
  getQuickSwapBundle,
  type QuickSwapContracts,
} from "./quickswap";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalAddress(name: string, fallback: Address): Address {
  const value = process.env[name];
  return (value ?? fallback) as Address;
}

export function getServerEnv() {
  const nodeEnv = optional("NODE_ENV", "development");
  return {
    port: Number(optional("PORT", "8080")),
    nodeEnv,
    apiDefaultVersion: optional("API_DEFAULT_VERSION", "v1"),
    logLevel: optional(
      "LOG_LEVEL",
      nodeEnv === "production" ? "info" : "debug",
    ),
  };
}

export function getAuthEnv() {
  const nodeEnv = optional("NODE_ENV", "development");
  return {
    jwtSecret: required("AUTH_JWT_SECRET"),
    cookieName: optional("AUTH_COOKIE_NAME", "arcane_session"),
    cookieMaxAgeSec: Number(optional("AUTH_COOKIE_MAX_AGE_SEC", "604800")),
    corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
    nodeEnv,
  };
}

/** Lazy — only throws when wallet features are used. */
export function getWalletEnv() {
  return {
    masterSeed: required("MASTER_SEED"),
    encryptionSecretKey: required("ENCRYPTION_SECRET_KEY"),
    somniaRpcHttp: optional(
      "SOMNIA_RPC_HTTP",
      "https://api.infra.testnet.somnia.network",
    ),
    somniaChainId: Number(optional("SOMNIA_CHAIN_ID", "50312")),
  };
}

/**
 * Somnia native agents (LLM inference, JSON API) — always testnet in Arcane.
 * Agent platform and agent ID 12847293847561029384 run on chain 50312.
 */
export function getSomniaAgentEnv() {
  return {
    chainId: Number(optional("SOMNIA_CHAIN_ID", "50312")),
    rpcHttp: optional(
      "SOMNIA_RPC_HTTP",
      "https://api.infra.testnet.somnia.network",
    ),
    rpcWs: optional(
      "SOMNIA_RPC_WS",
      "wss://dream-rpc.somnia.network/ws",
    ),
    agentPlatform: optionalAddress(
      "SOMNIA_AGENT_PLATFORM",
      "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776",
    ),
    llmAgentId: BigInt(
      optional("SOMNIA_LLM_AGENT_ID", "12847293847561029384"),
    ),
    llmPerAgentCostWei: BigInt(
      optional("SOMNIA_LLM_PER_AGENT_COST_WEI", "70000000000000000"),
    ),
    subcommitteeSize: 3n,
    requestTimeoutMs: Number(
      optional("SOMNIA_REQUEST_TIMEOUT_MS", "900000"),
    ),
  };
}

const DEFAULT_QUICKSWAP_SUBGRAPH_URL =
  "https://api.subgraph.somnia.network/api/public/962dcbf6-75ff-4e54-b778-6b5816c05e7d/subgraphs/somnia-swap/v1.0.0/gn";

export type QuickSwapEnv = {
  chainId: number;
  rpcHttp: string;
  rpcWs: string;
  contractsDeployed: boolean;
  contracts: QuickSwapContracts;
  subgraphUrl: string;
  /** Minimum TVL (USD) for subgraph pool discovery. Use 0 to include all indexed pools. */
  minPoolTvlUsd: number;
  poolDiscoveryCacheTtlMs: number;
  autoPoolMinCount: number;
  autoPoolMaxCount: number;
  autoPoolMinTvlUsd: number;
  defaultSlippageBps: number;
  maxSlippageBps: number;
  txReceiptTimeoutMs: number;
};

/**
 * QuickSwap V4 Algebra — mainnet pools (5031) by default.
 * Separate RPC from Somnia agent testnet so LLM and pool reads use the right network.
 */
export function getQuickSwapEnv(): QuickSwapEnv {
  const chainId = Number(
    optional("QUICKSWAP_CHAIN_ID", String(QUICKSWAP_MAINNET_BUNDLE.chainId)),
  );
  const bundle = getQuickSwapBundle(chainId);

  const contracts: QuickSwapContracts = {
    algebraFactory: optionalAddress(
      "QUICKSWAP_FACTORY",
      bundle.contracts.algebraFactory,
    ),
    swapRouter: optionalAddress(
      "QUICKSWAP_SWAP_ROUTER",
      bundle.contracts.swapRouter,
    ),
    quoterV2: optionalAddress(
      "QUICKSWAP_QUOTER_V2",
      bundle.contracts.quoterV2,
    ),
    positionManager: optionalAddress(
      "QUICKSWAP_POSITION_MANAGER",
      bundle.contracts.positionManager,
    ),
  };

  return {
    chainId,
    rpcHttp: optional("QUICKSWAP_RPC_HTTP", bundle.rpcHttpDefault),
    rpcWs: optional("QUICKSWAP_RPC_WS", bundle.rpcWsDefault ?? ""),
    contractsDeployed: bundle.contractsDeployed,
    contracts,
    subgraphUrl: optional("QUICKSWAP_SUBGRAPH_URL", DEFAULT_QUICKSWAP_SUBGRAPH_URL),
    minPoolTvlUsd: Number(optional("QUICKSWAP_MIN_POOL_TVL_USD", "0")),
    poolDiscoveryCacheTtlMs: Number(
      optional("QUICKSWAP_POOL_CACHE_TTL_MS", "60000"),
    ),
    autoPoolMinCount: Number(optional("QUICKSWAP_AUTO_POOL_MIN", "3")),
    autoPoolMaxCount: Number(optional("QUICKSWAP_AUTO_POOL_MAX", "4")),
    autoPoolMinTvlUsd: Number(optional("QUICKSWAP_AUTO_MIN_TVL_USD", "0.01")),
    defaultSlippageBps: Number(
      optional("QUICKSWAP_DEFAULT_SLIPPAGE_BPS", "50"),
    ),
    maxSlippageBps: Number(optional("QUICKSWAP_MAX_SLIPPAGE_BPS", "300")),
    txReceiptTimeoutMs: Number(
      optional("QUICKSWAP_TX_RECEIPT_TIMEOUT_MS", "120000"),
    ),
  };
}

/** Shared demo wallet on Anvil fork (paper trading). */
export const DEFAULT_DEMO_AGENT_WALLET =
  "0xA4B8fEC2837AE227Fd64f344ef663c5a0bA4e46e" as Address;

/** Token-rich address for Anvil impersonation when seeding the demo wallet. */
export const DEFAULT_DEMO_FORK_WHALE =
  "0xd1f1f7b4354bd07e2035d95c12e3192017928054" as Address;

export type DemoEnv = {
  agentWallet: Address;
  forkWhale: Address;
  anvilRpcUrl: string;
  /** When false, backend refuses demo trading cycles (e.g. Anvil unhealthy). */
  tradingEnabled: boolean;
};

/**
 * Demo / Anvil fork configuration.
 * Demo trading paths override `QUICKSWAP_RPC_HTTP` with `anvilRpcUrl` (see anvil-fork.service).
 */
export function getDemoEnv(): DemoEnv {
  return {
    agentWallet: optionalAddress("DEMO_AGENT_WALLET", DEFAULT_DEMO_AGENT_WALLET),
    forkWhale: optionalAddress("DEMO_FORK_WHALE", DEFAULT_DEMO_FORK_WHALE),
    anvilRpcUrl: optional("ANVIL_RPC_URL", "http://127.0.0.1:8545"),
    tradingEnabled: optional("DEMO_TRADING_ENABLED", "true") === "true",
  };
}

/** Drift rebalance + auto-execution guards (Phase 3.4). */
export function getTradingExecutionEnv() {
  return {
    driftThresholdPercent: Number(
      optional("TRADING_DRIFT_THRESHOLD_PERCENT", "5"),
    ),
    /** Max share of a token balance to swap in one cycle (basis points). */
    maxSwapPortfolioBps: Number(
      optional("TRADING_MAX_SWAP_PORTFOLIO_BPS", "2000"),
    ),
    /** Minimum token balance (raw units) before attempting a swap. */
    minSwapAmountRaw: BigInt(optional("TRADING_MIN_SWAP_AMOUNT_RAW", "1000")),
    /** Sum of pool-token balances (raw) required before a cycle may trade. */
    minPortfolioBalanceRaw: BigInt(
      optional("TRADING_MIN_PORTFOLIO_BALANCE_RAW", "1000"),
    ),
    /** Minimum minutes between trading cycles (scheduled/manual). */
    cycleCooldownMinutes: Number(
      optional("TRADING_CYCLE_COOLDOWN_MINUTES", "5"),
    ),
    maxLlmToolRounds: Number(optional("TRADING_MAX_LLM_TOOL_ROUNDS", "5")),
    llmMaxIterations: BigInt(optional("SOMNIA_LLM_MAX_ITERATIONS", "3")),
    workerEnabled: optional("TRADING_WORKER_ENABLED", "true") === "true",
    workerPollIntervalMs: Number(
      optional("TRADING_WORKER_POLL_INTERVAL_MS", "60000"),
    ),
    autoCycleIntervalMinutes: Number(
      optional("TRADING_AUTO_CYCLE_INTERVAL_MINUTES", "10"),
    ),
    customCycleIntervalMinutes: Number(
      optional("TRADING_CUSTOM_CYCLE_INTERVAL_MINUTES", "15"),
    ),
    depositDetectionEnabled:
      optional("TRADING_DEPOSIT_DETECTION_ENABLED", "true") === "true",
    somniaAttestationEnabled:
      optional("SOMNIA_ATTESTATION_ENABLED", "true") === "true",
    openaiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),
  };
}
