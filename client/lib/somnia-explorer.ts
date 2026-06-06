/** QuickSwap swaps execute on Somnia mainnet (5031). */
const QUICKSWAP_CHAIN_ID = 5031
const MAINNET_EXPLORER = "https://explorer.somnia.network"
const TESTNET_EXPLORER = "https://shannon-explorer.somnia.network"

export function somniaTxUrl(
  txHash: string,
  chainId: number = QUICKSWAP_CHAIN_ID,
): string {
  const base =
    chainId === 50312 ? TESTNET_EXPLORER : MAINNET_EXPLORER
  return `${base}/tx/${txHash}`
}

export function somniaAddressUrl(
  address: string,
  chainId: number = QUICKSWAP_CHAIN_ID,
): string {
  const base =
    chainId === 50312 ? TESTNET_EXPLORER : MAINNET_EXPLORER
  return `${base}/address/${address}`
}
