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

export type AccountModeUpdateResult = {
  user: AuthUserProfile;
  warning?: string;
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
  options?: { confirmLiveWallet?: boolean },
): Promise<AccountModeUpdateResult> {
  const user = await userRepo.findUserById(userId);
  if (!user) {
    throw new UserAccountError("USER_NOT_FOUND", "User not found", 404);
  }

  if (user.accountMode == null) {
    const updated = await userRepo.updateUserAccountMode(userId, accountMode);
    return { user: toAuthUserProfile(updated) };
  }

  if (user.accountMode === accountMode) {
    return {
      user: toAuthUserProfile(user),
      warning: "Account mode is already set to this value.",
    };
  }

  if (user.accountMode === "live" && accountMode === "demo") {
    const updated = await userRepo.updateUserAccountMode(userId, "demo");
    return {
      user: toAuthUserProfile(updated),
      warning:
        "Switched to demo. Trading and balances use the shared Anvil paper wallet. Live mainnet history remains separate.",
    };
  }

  if (user.accountMode === "demo" && accountMode === "live") {
    if (!options?.confirmLiveWallet) {
      throw new UserAccountError(
        "LIVE_SWITCH_CONFIRMATION_REQUIRED",
        "Switching to live requires confirmLiveWallet: true. Deposit to your live agent wallet before trading on mainnet.",
        400,
      );
    }

    const updated = await userRepo.updateUserAccountMode(userId, "live");
    return {
      user: toAuthUserProfile(updated),
      warning:
        "Switched to live mainnet. Fund your personal agent wallet before expecting live trades.",
    };
  }

  throw new UserAccountError(
    "ACCOUNT_MODE_SWITCH_FAILED",
    "Unable to update account mode",
    500,
  );
}
