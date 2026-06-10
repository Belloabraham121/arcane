import { createRequire } from "node:module";
import { parseAbi } from "viem";

const require = createRequire(import.meta.url);

export const algebraFactoryAbi = require(
  "@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json",
).abi;

export const algebraPoolAbi = require(
  "@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPool.sol/AlgebraPool.json",
).abi;

export const swapRouterAbi = require(
  "@cryptoalgebra/integral-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json",
).abi;

/**
 * Somnia mainnet SwapRouter (0x1582…) — deployed bytecode matches the pre-pluginData
 * router shape (no `pluginData` on single-hop, no `pluginData[]` on multihop).
 * The integral-periphery artifact ABI encodes a newer struct and reverts on-chain.
 */
export const swapRouterSomniaAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)",
]);

export const quoterV2Abi = require(
  "@cryptoalgebra/integral-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json",
).abi;

/** Trimmed ABI for quotes — full artifact ABI breaks viem tuple encoding on some calls. */
export const quoterV2QuoteAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) params) external returns (uint256 amountOut, uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate, uint16 fee)",
]);

export const nonfungiblePositionManagerAbi = require(
  "@cryptoalgebra/integral-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
).abi;

export const erc20MinimalAbi = require(
  "@cryptoalgebra/integral-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json",
).abi;
