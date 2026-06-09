import { apiRequest, type ApiEnvelope } from "./client";

export type AccountMode = "demo" | "live";

export type AuthUser = {
  id: string;
  email: string;
  walletAddress: string;
  accountMode: AccountMode | null;
  demoWalletAddress: string;
  liveWalletAddress: string;
  createdAt: string;
};

export type RegisterResponse = {
  user: AuthUser;
  wallet: {
    email: string;
    address: string;
    derivationPath: string;
  };
};

export async function register(email: string, password: string) {
  return apiRequest<RegisterResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string) {
  return apiRequest<{ user: AuthUser }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiRequest<{ loggedOut: boolean }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

export async function getMe() {
  return apiRequest<{ user: AuthUser }>("/api/v1/auth/me");
}

export type { ApiEnvelope };
