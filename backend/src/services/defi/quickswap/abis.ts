import { createRequire } from "node:module";

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

export const quoterV2Abi = require(
  "@cryptoalgebra/integral-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json",
).abi;

export const nonfungiblePositionManagerAbi = require(
  "@cryptoalgebra/integral-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
).abi;

export const erc20MinimalAbi = require(
  "@cryptoalgebra/integral-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json",
).abi;
