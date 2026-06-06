import { prisma } from "../../infrastructure/postgres/client";
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
  createdAt: Date;
};

function toPublic(user: {
  id: string;
  email: string;
  walletAddress: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    walletAddress: user.walletAddress,
    createdAt: user.createdAt,
  };
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
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
    },
  });
  return toPublic(user);
}
