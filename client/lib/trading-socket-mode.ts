import type { AccountMode } from "@/lib/api/auth"

/** When `filter` is set, only events tagged with the same account mode pass through. */
export function tradingSocketEventMatchesMode(
  eventAccountMode: AccountMode | undefined,
  filter: AccountMode | undefined,
): boolean {
  if (filter == null) {
    return true
  }
  return eventAccountMode === filter
}
