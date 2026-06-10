import type { Address } from "viem";

/** Base pools on Algebra Integral use zero address as plugin deployer. */
export const ZERO_DEPLOYER: Address =
  "0x0000000000000000000000000000000000000000";

export type QuickSwapContracts = {
  algebraFactory: Address;
  swapRouter: Address;
  quoterV2: Address;
  positionManager: Address;
};

export type QuickSwapToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  coinKey?: string;
};

/** Canonical pair for pool discovery (token0/token1 order does not matter for poolByPair). */
export type QuickSwapSeedPair = {
  id: string;
  label: string;
  tokenA: Address;
  tokenB: Address;
};

export type QuickSwapNetworkBundle = {
  chainId: number;
  name: string;
  /** False when contracts are not deployed on the public RPC (e.g. Somnia testnet today). */
  contractsDeployed: boolean;
  rpcHttpDefault: string;
  rpcWsDefault?: string;
  contracts: QuickSwapContracts;
  tokens: QuickSwapToken[];
  seedPairs: QuickSwapSeedPair[];
};

const MAINNET_TOKENS: QuickSwapToken[] = [
  {
    symbol: "WSOMI",
    name: "Wrapped SOMI",
    address: "0x046EDe9564A72571df6F5e44d0405360c0f4dCab",
    decimals: 18,
    coinKey: "WSOMI",
  },
  {
    symbol: "USDCe",
    name: "Bridged USDC (Stargate)",
    address: "0x28BEc7E30E6faee657a03e19Bf1128AaD7632A00",
    decimals: 6,
    coinKey: "USDCe",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x936Ab8C674bcb567CD5dEB85D8A216494704E9D8",
    decimals: 18,
  },
  {
    symbol: "USDT",
    name: "Bridged stgUSDT",
    address: "0x67B302E35Aef5EEE8c32D934F5856869EF428330",
    decimals: 6,
  },
];

const MAINNET_CONTRACTS: QuickSwapContracts = {
  algebraFactory: "0x0ccff3D02A3a200263eC4e0Fdb5E60a56721B8Ae",
  swapRouter: "0x1582f6f3D26658F7208A799Be46e34b1f366CE44",
  quoterV2: "0xcB68373404a835268D3ED76255C8148578A82b77",
  positionManager: "0xfE02219e0578B1E4831CDE7C3CB36f71AEb4A833",
};

function seedPairsFromTokens(tokens: QuickSwapToken[]): QuickSwapSeedPair[] {
  const bySymbol = Object.fromEntries(tokens.map((t) => [t.symbol, t.address])) as Record<
    string,
    Address
  >;

  const pairs: Array<[string, string, string]> = [
    ["usdce-wsomi", "USDCe/WSOMI", "USDCe,WSOMI"],
    ["usdce-weth", "USDCe/WETH", "USDCe,WETH"],
    ["wsomi-weth", "WSOMI/WETH", "WSOMI,WETH"],
  ];

  return pairs.map(([id, label, key]) => {
    const [a, b] = key.split(",");
    return {
      id,
      label,
      tokenA: bySymbol[a]!,
      tokenB: bySymbol[b]!,
    };
  });
}

/**
 * Somnia mainnet — QuickSwap V4 Algebra (verified live on api.infra.mainnet.somnia.network).
 * @see https://docs.quickswap.exchange/overview/contracts-and-addresses
 */
export const QUICKSWAP_MAINNET_BUNDLE: QuickSwapNetworkBundle = {
  chainId: 5031,
  name: "Somnia Mainnet",
  contractsDeployed: true,
  rpcHttpDefault: "https://api.infra.mainnet.somnia.network/",
  rpcWsDefault: "wss://api.infra.mainnet.somnia.network/ws",
  contracts: MAINNET_CONTRACTS,
  tokens: MAINNET_TOKENS,
  seedPairs: seedPairsFromTokens(MAINNET_TOKENS),
};

/**
 * Somnia testnet — QuickSwap is not published in official docs and has no bytecode on
 * the public testnet RPC as of 2026-06. Stub for future use; do not trade here yet.
 */
export const QUICKSWAP_TESTNET_BUNDLE: QuickSwapNetworkBundle = {
  chainId: 50312,
  name: "Somnia Testnet",
  contractsDeployed: false,
  rpcHttpDefault: "https://api.infra.testnet.somnia.network",
  rpcWsDefault: "wss://dream-rpc.somnia.network/ws",
  contracts: {
    algebraFactory: "0x0000000000000000000000000000000000000000",
    swapRouter: "0x0000000000000000000000000000000000000000",
    quoterV2: "0x0000000000000000000000000000000000000000",
    positionManager: "0x0000000000000000000000000000000000000000",
  },
  tokens: [],
  seedPairs: [],
};

const BUNDLES_BY_CHAIN_ID: Record<number, QuickSwapNetworkBundle> = {
  [QUICKSWAP_MAINNET_BUNDLE.chainId]: QUICKSWAP_MAINNET_BUNDLE,
  [QUICKSWAP_TESTNET_BUNDLE.chainId]: QUICKSWAP_TESTNET_BUNDLE,
};

export function getQuickSwapBundle(chainId: number): QuickSwapNetworkBundle {
  const bundle = BUNDLES_BY_CHAIN_ID[chainId];
  if (!bundle) {
    throw new Error(
      `Unsupported QuickSwap chainId ${chainId}. Supported: ${Object.keys(BUNDLES_BY_CHAIN_ID).join(", ")}`,
    );
  }
  return bundle;
}

export function getQuickSwapToken(
  chainId: number,
  symbol: string,
): QuickSwapToken | undefined {
  const normalized = symbol.toUpperCase();
  return getQuickSwapBundle(chainId).tokens.find(
    (t) => t.symbol.toUpperCase() === normalized,
  );
}

export function getQuickSwapTokenByAddress(
  chainId: number,
  address: Address,
): QuickSwapToken | undefined {
  const lower = address.toLowerCase();
  return getQuickSwapBundle(chainId).tokens.find(
    (t) => t.address.toLowerCase() === lower,
  );
}
