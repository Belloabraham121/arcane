import { getAddress, type Address } from "viem";
import { getMarketplaceBuyerSttBalanceWei } from "./buyer-wallet.js";
import { formatInsufficientSttMessage } from "./preflight.js";

const DEFAULT_GAS_BUFFER_STT_WEI = 50_000_000_000_000_000n;

export class MarketplacePaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplacePaymentValidationError";
  }
}

/** Self-payments (buyer === seller) only consume gas; cross-wallet needs amount + gas. */
export function requiredSttWeiForMarketplacePayment(input: {
  buyerAddress: Address;
  sellerAddress: Address;
  amountWei: bigint;
  gasBufferWei?: bigint;
}): bigint {
  const gasBuffer = input.gasBufferWei ?? DEFAULT_GAS_BUFFER_STT_WEI;
  const selfPayment =
    getAddress(input.buyerAddress) === getAddress(input.sellerAddress);
  return selfPayment ? gasBuffer : input.amountWei + gasBuffer;
}

export async function assertMarketplaceSttPaymentReady(input: {
  userId: string;
  sellerAddress: Address;
  amountWei: bigint;
  gasBufferWei?: bigint;
}): Promise<{
  buyerAddress: Address;
  balanceSttWei: bigint;
  selfPayment: boolean;
  requiredSttWei: bigint;
}> {
  const { walletAddress, balanceSttWei } =
    await getMarketplaceBuyerSttBalanceWei(input.userId);
  const buyerAddress = getAddress(walletAddress);
  const requiredSttWei = requiredSttWeiForMarketplacePayment({
    buyerAddress,
    sellerAddress: input.sellerAddress,
    amountWei: input.amountWei,
    gasBufferWei: input.gasBufferWei,
  });
  const selfPayment =
    getAddress(buyerAddress) === getAddress(input.sellerAddress);

  if (balanceSttWei < requiredSttWei) {
    throw new MarketplacePaymentValidationError(
      formatInsufficientSttMessage({
        walletAddress: buyerAddress,
        balanceSttWei,
        requiredSttWei,
      }) +
        (selfPayment
          ? " (seller equals agent wallet — only gas STT is required for self-payment)"
          : ""),
    );
  }

  return { buyerAddress, balanceSttWei, selfPayment, requiredSttWei };
}
