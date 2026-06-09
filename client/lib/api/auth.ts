import { apiRequest, type ApiEnvelope } from "./client";
import {
  fetchUserProfile,
  type AccountMode,
  type UserProfile,
} from "./profile";

/** @deprecated Prefer `UserProfile` from `@/lib/api/profile`. */
export type AuthUser = UserProfile;

export type { AccountMode };

export type RegisterResponse = {
  user: UserProfile;
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
  return apiRequest<{ user: UserProfile }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiRequest<{ loggedOut: boolean }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

/** @deprecated Prefer `fetchUserProfile` from `@/lib/api/profile`. */
export async function getMe() {
  return fetchUserProfile();
}

export type { ApiEnvelope };
