import { apiRequest } from "./client";
import type { AccountMode, AuthUser } from "./auth";

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

export async function patchAccountMode(accountMode: AccountMode) {
  return apiRequest<{ user: AuthUser }>("/api/v1/users/account-mode", {
    method: "PATCH",
    body: JSON.stringify({ accountMode }),
  });
}
