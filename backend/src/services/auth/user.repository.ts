import type { AccountMode } from "@prisma/client";
import type { Address } from "viem";
import { prisma } from "../../infrastructure/postgres/client";
import type { EncryptedPrivateKey } from "../../utils/wallet-crypto";
import type { UserWalletRecord } from "./types";

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  wallet: UserWalletRecord;
};

export type PublicUser = {
  id: string;
  email: string;
  walletAddress: string;
  accountMode: AccountMode | null;
  createdAt: Date;
};

function toPublic(user: {
  id: string;
  email: string;
  walletAddress: string;
  accountMode: AccountMode | null;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    walletAddress: user.walletAddress,
    accountMode: user.accountMode,
    createdAt: user.createdAt,
  };
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export type UserWalletCredentials = {
  userId: string;
  walletAddress: Address;
  encryptedPrivateKey: EncryptedPrivateKey;
};

/** Encrypted agent wallet material for server-side signing only. */
export async function findUserWalletCredentials(
  userId: string,
): Promise<UserWalletCredentials | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    walletAddress: user.walletAddress as Address,
    encryptedPrivateKey: {
      encryptedData: user.encryptedPrivateKey,
      iv: user.encryptionIv,
      authTag: user.encryptionAuthTag,
    },
  };
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      walletAddress: input.wallet.address,
      walletDerivationPath: input.wallet.derivationPath,
      encryptedPrivateKey: input.wallet.encryptedPrivateKey.encryptedData,
      encryptionIv: input.wallet.encryptedPrivateKey.iv,
      encryptionAuthTag: input.wallet.encryptedPrivateKey.authTag,
      // accountMode stays null until /onboarding/account-mode
    },
  });
  return toPublic(user);
}

export async function updateUserAccountMode(
  userId: string,
  accountMode: AccountMode,
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountMode },
  });
  return toPublic(user);
}
