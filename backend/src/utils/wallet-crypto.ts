import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("arcane-wallet-v1", "utf8");

export type EncryptedPrivateKey = {
  encryptedData: string;
  iv: string;
  authTag: string;
};

function secretKeyFromHex(hex: string): Buffer {
  const key = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_SECRET_KEY must be 32 bytes (64 hex characters)");
  }
  return key;
}

export function encryptPrivateKey(
  privateKey: string,
  encryptionSecretKeyHex: string,
): EncryptedPrivateKey {
  const secretKey = secretKeyFromHex(encryptionSecretKeyHex);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);
  cipher.setAAD(AAD);

  let encryptedData = cipher.update(privateKey, "utf8", "hex");
  encryptedData += cipher.final("hex");

  return {
    encryptedData,
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptPrivateKey(
  payload: EncryptedPrivateKey,
  encryptionSecretKeyHex: string,
): string {
  const secretKey = secretKeyFromHex(encryptionSecretKeyHex);
  const iv = Buffer.from(payload.iv, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));

  let privateKey = decipher.update(payload.encryptedData, "hex", "utf8");
  privateKey += decipher.final("utf8");
  return privateKey;
}
