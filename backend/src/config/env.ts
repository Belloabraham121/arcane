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

export type QuickSwapEnv = {
  chainId: number;
  rpcHttp: string;
  rpcWs: string;
  contractsDeployed: boolean;
  contracts: QuickSwapContracts;
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
    defaultSlippageBps: Number(
      optional("QUICKSWAP_DEFAULT_SLIPPAGE_BPS", "50"),
    ),
    maxSlippageBps: Number(optional("QUICKSWAP_MAX_SLIPPAGE_BPS", "300")),
    txReceiptTimeoutMs: Number(
      optional("QUICKSWAP_TX_RECEIPT_TIMEOUT_MS", "120000"),
    ),
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
      optional("TRADING_MAX_SWAP_PORTFOLIO_BPS", "2500"),
    ),
    /** Minimum token balance (raw units) before attempting a swap. */
    minSwapAmountRaw: BigInt(optional("TRADING_MIN_SWAP_AMOUNT_RAW", "1000")),
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
  };
}
