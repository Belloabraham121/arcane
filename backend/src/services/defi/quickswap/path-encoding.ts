import { encodePacked, type Address, type Hex } from "viem";
import { ZERO_DEPLOYER } from "../../../config/quickswap";

/**
 * Algebra Integral path layout (Path.sol):
 * token (20) + deployer (20) + token (20) + deployer (20) + … + token (20).
 */
export function encodeAlgebraSwapPath(
  tokens: readonly Address[],
  deployer: Address = ZERO_DEPLOYER,
): Hex {
  if (tokens.length < 2) {
    throw new Error("Swap path requires at least two token addresses");
  }

  const packed: Address[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    packed.push(tokens[i]!, deployer);
  }
  packed.push(tokens[tokens.length - 1]!);

  return encodePacked(
    packed.map(() => "address" as const),
    packed,
  );
}

/** Empty plugin payloads — one per hop for base (non-plugin) pools. */
export function emptyPluginDataForHops(hopCount: number): readonly `0x${string}`[] {
  if (hopCount < 1) {
    throw new Error("hopCount must be at least 1");
  }
  return Array.from({ length: hopCount }, () => "0x" as const);
}
