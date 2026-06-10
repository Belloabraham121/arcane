import { apiRequest } from "./client";
import {
  updateAccountMode,
  type AccountMode,
  type UserProfile,
} from "./profile";

export type { AccountMode };

export type DemoPreviewBalance = {
  symbol: string;
  formatted: string;
  note: string;
};

export type DemoPreview = {
  demoWalletAddress: string;
  chainLabel: string;
  description: string;
  depositAmountUsd: number;
  seededBalances: DemoPreviewBalance[];
  anvilRequired: boolean;
};

export async function fetchDemoPreview() {
  return apiRequest<DemoPreview>("/api/v1/demo/preview");
}

/** @deprecated Prefer `updateAccountMode` from `@/lib/api/profile`. */
export async function patchAccountMode(
  accountMode: AccountMode,
  options?: { confirmLiveWallet?: boolean },
) {
  return updateAccountMode(accountMode, options);
}

export type { UserProfile };
