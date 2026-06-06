import { HDNodeWallet } from "ethers";
import { Mnemonic, keccak256, toUtf8Bytes } from "ethers";
import { getWalletEnv } from "../../config/env";
import { normalizeEmail } from "../../utils/email";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  type EncryptedPrivateKey,
} from "../../utils/wallet-crypto";
import type { PublicUserWallet, UserWalletRecord } from "./types";

const MAX_DERIVATION_INDEX = 2_147_483_647n;

export type DerivedWallet = {
  address: string;
  derivationPath: string;
  privateKey: string;
};

/**
 * Deterministic Somnia/EVM wallet from a user's email.
 *
 * Same pattern as phone-based custodial wallets:
 *   MASTER_SEED → BIP-44 path keyed by keccak256(normalizedEmail)
 *
 * Store only the encrypted private key at rest; keep MASTER_SEED in KMS/secrets manager.
 */
export class EmailWalletService {
  private masterNode: HDNodeWallet;

  constructor(masterSeed?: string) {
    const seed = masterSeed ?? getWalletEnv().masterSeed;
    if (!seed || seed.includes("_here") || seed === "your_master_seed_here") {
      throw new Error(
        "MASTER_SEED is missing or still a placeholder. Set a valid 12/24-word BIP39 mnemonic in .env (generate: npx ethers-cli wallet create-mnemonic, or use a secrets manager in production).",
      );
    }
    if (!Mnemonic.isValidMnemonic(seed)) {
      throw new Error(
        "MASTER_SEED must be a valid BIP39 mnemonic (12 or 24 lowercase words separated by spaces).",
      );
    }
    this.masterNode = HDNodeWallet.fromSeed(Mnemonic.fromPhrase(seed).computeSeed());
  }

  /** Derive the on-chain address for an email (idempotent). */
  deriveFromEmail(email: string): DerivedWallet {
    const normalizedEmail = normalizeEmail(email);
    const emailHash = keccak256(toUtf8Bytes(normalizedEmail));
    const index = BigInt(emailHash) % MAX_DERIVATION_INDEX;
    const derivationPath = `m/44'/60'/0'/0/${index.toString()}`;
    const wallet = this.masterNode.derivePath(derivationPath);

    return {
      address: wallet.address,
      derivationPath,
      privateKey: wallet.privateKey,
    };
  }

  /** Build a storable wallet record with encrypted key material. */
  createWalletRecord(email: string): UserWalletRecord {
    const normalizedEmail = normalizeEmail(email);
    const derived = this.deriveFromEmail(normalizedEmail);
    const { encryptionSecretKey } = getWalletEnv();
    if (
      !encryptionSecretKey ||
      encryptionSecretKey.includes("_here") ||
      encryptionSecretKey === "your_encryption_secret_key_here"
    ) {
      throw new Error(
        "ENCRYPTION_SECRET_KEY is missing or still a placeholder. Set a 64-character hex string in .env (generate: openssl rand -hex 32).",
      );
    }
    const encryptedPrivateKey = encryptPrivateKey(
      derived.privateKey,
      encryptionSecretKey,
    );
    const now = new Date();

    return {
      email: normalizedEmail,
      address: derived.address,
      derivationPath: derived.derivationPath,
      encryptedPrivateKey,
      createdAt: now,
      updatedAt: now,
    };
  }

  toPublic(record: UserWalletRecord): PublicUserWallet {
    return {
      email: record.email,
      address: record.address,
      derivationPath: record.derivationPath,
    };
  }

  /** Server-side signing only — never expose decrypted keys to clients. */
  decryptStoredPrivateKey(encrypted: EncryptedPrivateKey): string {
    const { encryptionSecretKey } = getWalletEnv();
    return decryptPrivateKey(encrypted, encryptionSecretKey);
  }
}

export const emailWalletService = new EmailWalletService();
