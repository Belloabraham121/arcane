import { apiRequest } from "./client"

export type AccountMode = "demo" | "live"

/** User profile from `GET /api/v1/auth/me`. */
export type UserProfile = {
  id: string
  email: string
  /** Custodial live agent wallet (legacy field — same as `liveWalletAddress`). */
  walletAddress: string
  accountMode: AccountMode | null
  demoWalletAddress: string
  liveWalletAddress: string
  createdAt: string
}

export type AccountModeUpdateResponse = {
  user: UserProfile
  warning: string | null
}

/** Active trading wallet for the user's account mode (or live wallet before onboarding). */
export function tradingWalletForProfile(profile: UserProfile): string {
  if (profile.accountMode === "demo") {
    return profile.demoWalletAddress
  }
  return profile.liveWalletAddress
}

export function hasChosenAccountMode(
  profile: UserProfile,
): profile is UserProfile & { accountMode: AccountMode } {
  return profile.accountMode != null
}

/** Fetch the authenticated user's profile. */
export async function fetchUserProfile() {
  return apiRequest<{ user: UserProfile }>("/api/v1/auth/me")
}

/** Set or switch account mode (`PATCH /api/v1/users/account-mode`). */
export async function updateAccountMode(
  accountMode: AccountMode,
  options?: { confirmLiveWallet?: boolean },
) {
  return apiRequest<AccountModeUpdateResponse>("/api/v1/users/account-mode", {
    method: "PATCH",
    body: JSON.stringify({
      accountMode,
      confirmLiveWallet: options?.confirmLiveWallet,
    }),
  })
}
