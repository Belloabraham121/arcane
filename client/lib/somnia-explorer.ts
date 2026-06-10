/** QuickSwap swaps execute on Somnia mainnet (5031). */
export const SOMNIA_MAINNET_CHAIN_ID = 5031
/** Marketplace x402 STT payments execute on Somnia testnet (50312). */
export const SOMNIA_MARKETPLACE_CHAIN_ID = 50312

const MAINNET_EXPLORER = "https://explorer.somnia.network"
const TESTNET_EXPLORER = "https://shannon-explorer.somnia.network"

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

/** Shannon explorer link for Marketplace x402 STT payments (testnet). */
export function marketplaceTxUrl(txHash: string): string {
  return somniaTxUrl(txHash, SOMNIA_MARKETPLACE_CHAIN_ID)
}

export function somniaAddressUrl(
  address: string,
  chainId: number = SOMNIA_MAINNET_CHAIN_ID,
): string {
  return `${explorerBaseForChain(chainId)}/address/${address}`
}
