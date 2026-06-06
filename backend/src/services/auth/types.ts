import type { EncryptedPrivateKey } from "../../utils/wallet-crypto";

export type UserWalletRecord = {
  email: string;
  address: string;
  derivationPath: string;
  encryptedPrivateKey: EncryptedPrivateKey;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUserWallet = {
  email: string;
  address: string;
  derivationPath: string;
};
