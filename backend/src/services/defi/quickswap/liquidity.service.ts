import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { ZERO_DEPLOYER } from "../../../config/quickswap";
import { getQuickSwapEnv } from "../../../config/env";
import { nonfungiblePositionManagerAbi } from "./abis";
import { getQuickSwapPublicClient } from "./client";
import { QuickSwapNotDeployedError } from "./pool-registry";
import {
  applySlippageMinimum,
  buildApprove,
  defaultSwapDeadline,
} from "./swap.service";
import type {
  CollectFeesBuildResult,
  EncodedTxCall,
  LiquidityAmounts,
  MintPositionBuildResult,
  NpmPositionState,
  RemoveLiquidityBuildResult,
  TickRange,
} from "./types";

const MAX_UINT128 = 2n ** 128n - 1n;

export class LiquidityBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiquidityBuildError";
  }
}

function assertQuickSwapDeployed(): void {
  const { chainId, contractsDeployed } = getQuickSwapEnv();
  if (!contractsDeployed) {
    throw new QuickSwapNotDeployedError(chainId);
  }
}

function sortTokensAndAmounts(
  tokenA: Address,
  tokenB: Address,
  amountA: bigint,
  amountB: bigint,
): { token0: Address; token1: Address; amount0: bigint; amount1: bigint } {
  if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
    throw new LiquidityBuildError("token0 and token1 must differ");
  }

  if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
    return {
      token0: tokenA,
      token1: tokenB,
      amount0: amountA,
      amount1: amountB,
    };
  }

  return {
    token0: tokenB,
    token1: tokenA,
    amount0: amountB,
    amount1: amountA,
  };
}

function applyAmountMinimum(amount: bigint, slippageBps: number): bigint {
  return applySlippageMinimum(amount, slippageBps);
}

function validateTickRange(range: TickRange): void {
  if (range.tickLower >= range.tickUpper) {
    throw new LiquidityBuildError("tickLower must be less than tickUpper");
  }
}

function validatePercent(percent: number): void {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new LiquidityBuildError("percent must be between 0 and 100 (exclusive of 0)");
  }
}

export type BuildMintOptions = {
  recipient: Address;
  slippageBps?: number;
  deadline?: bigint;
  deployer?: Address;
  pluginData?: Hex;
};

/**
 * Build NPM `mint` calldata + ERC-20 approvals for the position manager.
 */
export function buildMintPosition(
  token0: Address,
  token1: Address,
  amounts: LiquidityAmounts,
  tickRange: TickRange,
  options: BuildMintOptions,
): MintPositionBuildResult {
  assertQuickSwapDeployed();
  validateTickRange(tickRange);

  if (amounts.amount0 < 0n || amounts.amount1 < 0n) {
    throw new LiquidityBuildError("amounts must be non-negative");
  }
  if (amounts.amount0 === 0n && amounts.amount1 === 0n) {
    throw new LiquidityBuildError("at least one desired amount must be positive");
  }

  const { contracts, defaultSlippageBps } = getQuickSwapEnv();
  const slippageBps = options.slippageBps ?? defaultSlippageBps;
  const deadline = options.deadline ?? defaultSwapDeadline();
  const deployer = options.deployer ?? ZERO_DEPLOYER;

  const sorted = sortTokensAndAmounts(
    token0,
    token1,
    amounts.amount0,
    amounts.amount1,
  );

  const amount0Min = applyAmountMinimum(sorted.amount0, slippageBps);
  const amount1Min = applyAmountMinimum(sorted.amount1, slippageBps);

  const data = encodeFunctionData({
    abi: nonfungiblePositionManagerAbi,
    functionName: "mint",
    args: [
      {
        token0: sorted.token0,
        token1: sorted.token1,
        deployer,
        tickLower: tickRange.tickLower,
        tickUpper: tickRange.tickUpper,
        amount0Desired: sorted.amount0,
        amount1Desired: sorted.amount1,
        amount0Min,
        amount1Min,
        recipient: options.recipient,
        deadline,
        pluginData: options.pluginData ?? "0x",
      },
    ],
  });

  const approvals: EncodedTxCall[] = [];
  if (sorted.amount0 > 0n) {
    approvals.push(
      buildApprove(sorted.token0, contracts.positionManager, sorted.amount0),
    );
  }
  if (sorted.amount1 > 0n) {
    approvals.push(
      buildApprove(sorted.token1, contracts.positionManager, sorted.amount1),
    );
  }

  return {
    kind: "mint",
    call: { to: contracts.positionManager, data },
    positionManager: contracts.positionManager,
    token0: sorted.token0,
    token1: sorted.token1,
    amount0Desired: sorted.amount0,
    amount1Desired: sorted.amount1,
    amount0Min,
    amount1Min,
    tickLower: tickRange.tickLower,
    tickUpper: tickRange.tickUpper,
    deadline,
    approvals,
  };
}

export async function readPositionState(
  tokenId: bigint,
): Promise<NpmPositionState> {
  assertQuickSwapDeployed();
  const { contracts } = getQuickSwapEnv();
  const client = getQuickSwapPublicClient();

  const result = await client.readContract({
    address: contracts.positionManager,
    abi: nonfungiblePositionManagerAbi,
    functionName: "positions",
    args: [tokenId],
  });

  const [
    ,
    ,
    token0,
    token1,
    deployer,
    tickLower,
    tickUpper,
    liquidity,
    ,
    ,
    tokensOwed0,
    tokensOwed1,
  ] = result;

  return {
    tokenId,
    token0,
    token1,
    deployer,
    tickLower,
    tickUpper,
    liquidity: BigInt(liquidity),
    tokensOwed0: BigInt(tokensOwed0),
    tokensOwed1: BigInt(tokensOwed1),
  };
}

export type BuildRemoveLiquidityOptions = {
  slippageBps?: number;
  deadline?: bigint;
  pluginData?: Hex;
  /** Skip on-chain read when liquidity is already known. */
  liquidity?: bigint;
};

/**
 * Build NPM `decreaseLiquidity` for a percentage of an existing position.
 */
export async function buildRemoveLiquidity(
  tokenId: bigint,
  percent: number,
  options?: BuildRemoveLiquidityOptions,
): Promise<RemoveLiquidityBuildResult> {
  assertQuickSwapDeployed();
  validatePercent(percent);

  const position = await readPositionState(tokenId);
  const totalLiquidity = options?.liquidity ?? position.liquidity;
  if (totalLiquidity <= 0n) {
    throw new LiquidityBuildError("Position has no liquidity to remove");
  }

  const liquidity = (totalLiquidity * BigInt(Math.round(percent))) / 100n;
  if (liquidity <= 0n) {
    throw new LiquidityBuildError("Computed liquidity to remove is zero");
  }

  const { contracts } = getQuickSwapEnv();
  const deadline = options?.deadline ?? defaultSwapDeadline();

  // Output mins require pool simulation — default to zero (NPM still enforces position bounds).
  const amount0Min = 0n;
  const amount1Min = 0n;

  const data = encodeFunctionData({
    abi: nonfungiblePositionManagerAbi,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId,
        liquidity,
        amount0Min,
        amount1Min,
        deadline,
        pluginData: options?.pluginData ?? "0x",
      },
    ],
  });

  return {
    kind: "decrease_liquidity",
    call: { to: contracts.positionManager, data },
    positionManager: contracts.positionManager,
    tokenId,
    liquidity,
    percent,
    amount0Min,
    amount1Min,
    deadline,
  };
}

export type BuildCollectFeesOptions = {
  recipient?: Address;
  amount0Max?: bigint;
  amount1Max?: bigint;
};

/**
 * Build NPM `collect` to withdraw accrued fees (and tokens owed) from a position.
 */
export function buildCollectFees(
  tokenId: bigint,
  recipient: Address,
  options?: BuildCollectFeesOptions,
): CollectFeesBuildResult {
  assertQuickSwapDeployed();

  const { contracts } = getQuickSwapEnv();
  const data = encodeFunctionData({
    abi: nonfungiblePositionManagerAbi,
    functionName: "collect",
    args: [
      {
        tokenId,
        recipient: options?.recipient ?? recipient,
        amount0Max: options?.amount0Max ?? MAX_UINT128,
        amount1Max: options?.amount1Max ?? MAX_UINT128,
      },
    ],
  });

  return {
    kind: "collect",
    call: { to: contracts.positionManager, data },
    positionManager: contracts.positionManager,
    tokenId,
    recipient: options?.recipient ?? recipient,
  };
}
