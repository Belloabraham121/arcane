import type { AccountMode } from "@prisma/client";
import { getDemoEnv } from "../../config/env";
import * as userRepo from "./user.repository";

export class UserAccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UserAccountError";
  }
}

export type AuthUserProfile = {
  id: string;
  email: string;
  walletAddress: string;
  accountMode: AccountMode | null;
  demoWalletAddress: string;
  liveWalletAddress: string;
  createdAt: Date;
};

export function toAuthUserProfile(user: {
  id: string;
  email: string;
  walletAddress: string;
  accountMode: AccountMode | null;
  createdAt: Date;
}): AuthUserProfile {
  const demoEnv = getDemoEnv();
  return {
    id: user.id,
    email: user.email,
    walletAddress: user.walletAddress,
    accountMode: user.accountMode,
    demoWalletAddress: demoEnv.agentWallet,
    liveWalletAddress: user.walletAddress,
    createdAt: user.createdAt,
  };
}

export async function setUserAccountMode(
  userId: string,
  accountMode: AccountMode,
): Promise<AuthUserProfile> {
  const user = await userRepo.findUserById(userId);
  if (!user) {
    throw new UserAccountError("USER_NOT_FOUND", "User not found", 404);
  }

  if (user.accountMode != null) {
    throw new UserAccountError(
      "ACCOUNT_MODE_ALREADY_SET",
      "Account mode was already chosen. Contact support to change it.",
      409,
    );
  }

  const updated = await userRepo.updateUserAccountMode(userId, accountMode);
  return toAuthUserProfile(updated);
}
