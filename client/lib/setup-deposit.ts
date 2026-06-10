import type { AccountMode } from "@/lib/api/profile"
import { DEFAULT_DEMO_DEPOSIT_AMOUNT } from "@/lib/api/strategy-types"

/** Legacy live default (500k) and other inflated setup placeholders. */
export const INFLATED_DEMO_DEPOSIT_THRESHOLD = 100_000

export function isInflatedDemoDeposit(amount: number): boolean {
  return amount >= INFLATED_DEMO_DEPOSIT_THRESHOLD
}

/** Deposit to show in setup UI — ignores inflated live/demo defaults. */
export function strategyDepositForSetup(
  accountMode: AccountMode | null,
  savedDeposit?: number,
): number | undefined {
  if (savedDeposit == null || savedDeposit <= 0) {
    return undefined
  }

  if (isInflatedDemoDeposit(savedDeposit)) {
    return undefined
  }

  return savedDeposit
}

export function demoDepositFallback(): number {
  return DEFAULT_DEMO_DEPOSIT_AMOUNT
}
