import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function getServerEnv() {
  return {
    port: Number(optional("PORT", "8080")),
    nodeEnv: optional("NODE_ENV", "development"),
    apiDefaultVersion: optional("API_DEFAULT_VERSION", "v1"),
  };
}

/** Lazy — only throws when wallet features are used. */
export function getWalletEnv() {
  return {
    masterSeed: required("MASTER_SEED"),
    encryptionSecretKey: required("ENCRYPTION_SECRET_KEY"),
    somniaRpcHttp: optional(
      "SOMNIA_RPC_HTTP",
      "https://api.infra.testnet.somnia.network",
    ),
    somniaChainId: Number(optional("SOMNIA_CHAIN_ID", "50312")),
  };
}
