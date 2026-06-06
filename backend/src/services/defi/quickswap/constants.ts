import { ZERO_DEPLOYER } from "../../../config/quickswap";

export { ZERO_DEPLOYER };

/** Default max hops for route planning (Phase 2). */
export const MAX_SWAP_HOPS = 3;

/** One unit of each known token for sample quotes (Phase 1.2). */
export const SAMPLE_QUOTE_AMOUNT: Record<string, bigint> = {
  USDCe: 1_000_000n,
  USDT: 1_000_000n,
  WSOMI: 10n ** 18n,
  WETH: 10n ** 15n,
};
