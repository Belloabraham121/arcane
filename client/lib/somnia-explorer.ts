/** QuickSwap swaps execute on Somnia mainnet (5031). */
export const SOMNIA_MAINNET_CHAIN_ID = 5031
/** Marketplace x402 STT payments execute on Somnia testnet (50312). */
export const SOMNIA_MARKETPLACE_CHAIN_ID = 50312

const MAINNET_EXPLORER = "https://explorer.somnia.network"
/** Somnia testnet — marketplace x402 + on-chain LLM attestation. */
const TESTNET_EXPLORER = "https://testnet.somnia.exploreme.pro"

function explorerBaseForChain(chainId: number): string {
  return chainId === SOMNIA_MARKETPLACE_CHAIN_ID
    ? TESTNET_EXPLORER
    : MAINNET_EXPLORER
}

export function somniaTxUrl(
  txHash: string,
  chainId: number = SOMNIA_MAINNET_CHAIN_ID,
): string {
  return `${explorerBaseForChain(chainId)}/tx/${txHash}`
}

/** Testnet explorer link (ExploreMe) for x402 and LLM attestation txs. */
export function somniaTestnetTxUrl(txHash: string): string {
  return somniaTxUrl(txHash, SOMNIA_MARKETPLACE_CHAIN_ID)
}

/** @deprecated alias — use somniaTestnetTxUrl */
export function marketplaceTxUrl(txHash: string): string {
  return somniaTestnetTxUrl(txHash)
}

/** On-chain Somnia LLM attestation (createRequest on testnet). */
export function somniaAttestationTxUrl(txHash: string): string {
  return somniaTestnetTxUrl(txHash)
}

export function somniaAddressUrl(
  address: string,
  chainId: number = SOMNIA_MAINNET_CHAIN_ID,
): string {
  return `${explorerBaseForChain(chainId)}/address/${address}`
}
