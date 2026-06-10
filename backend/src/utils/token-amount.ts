import type { Address } from "viem";
import { formatUnits } from "viem";

export type AmountResolution = {
  amount: bigint;
  corrected: boolean;
  original?: string;
  reason?: string;
};

/**
 * Fix LLM amounts that use human counts or wrong decimal scale (e.g. 6230000 on 18-dec WSOMI).
 * Prefers server-computed recommendedAction.amountInRaw when the request is wildly off.
 */
export function resolveToolAmountIn(input: {
  requested: bigint;
  tokenAddress: Address;
  balanceRaw: bigint;
  decimals: number;
  minSwapAmountRaw: bigint;
  recommendedRaw?: bigint | null;
}): AmountResolution {
  const { balanceRaw, decimals, minSwapAmountRaw, recommendedRaw } = input;
  let amount = input.requested;

  if (amount <= 0n && recommendedRaw && recommendedRaw > 0n) {
    return {
      amount: recommendedRaw,
      corrected: true,
      original: amount.toString(),
      reason: "empty amount — using recommendedAction.amountInRaw",
    };
  }

  const oneToken = 10n ** BigInt(decimals);

  // e.g. 6230000 meant 6.23 WSOMI (6-decimal style) on an 18-decimal token
  if (balanceRaw > 0n && amount > 0n && amount < oneToken / 1000n) {
    for (const wrongDecimals of [6, 8, 9, 12] as const) {
      if (wrongDecimals >= decimals) {
        continue;
      }
      const scale = 10n ** BigInt(decimals - wrongDecimals);
      const candidate = amount * scale;
      if (candidate >= minSwapAmountRaw && candidate <= balanceRaw) {
        return {
          amount: candidate,
          corrected: true,
          original: amount.toString(),
          reason: `scaled ${wrongDecimals}-decimal-style value to ${decimals} decimals`,
        };
      }
    }
  }

  if (recommendedRaw && recommendedRaw > 0n && amount > 0n) {
    const ratio =
      recommendedRaw >= amount
        ? recommendedRaw / amount
        : amount / recommendedRaw;
    if (ratio > 1000n) {
      return {
        amount: recommendedRaw,
        corrected: true,
        original: amount.toString(),
        reason: "replaced with recommendedAction.amountInRaw",
      };
    }
  }

  return { amount, corrected: false };
}

export function formatAmountHint(amount: bigint, decimals: number, symbol: string): string {
  const formatted = formatUnits(amount, decimals);
  return `${formatted} ${symbol} (raw: ${amount.toString()})`;
}
