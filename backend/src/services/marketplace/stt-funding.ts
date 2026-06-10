import type { Address, Hash, Hex } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getSomniaAgentEnv } from "../../config/env.js";
import { somniaAgentChain } from "../../config/somnia-chains.js";
import {
  createMarketplaceTestnetPublicClient,
  getMarketplaceBuyerSttBalanceWei,
  waitForMarketplaceTestnetReceipt,
} from "./buyer-wallet.js";

/** Default smoke top-up: 30 STT on Somnia testnet. */
export const DEFAULT_SMOKE_FUND_STT_WEI = 30n * 10n ** 18n;

export type FundAgentSttIfEmptyResult = {
  funded: boolean;
  agentAddress: Address;
  balanceBeforeWei: bigint;
  balanceAfterWei: bigint;
  txHash?: Hash;
  reason?: string;
};

function parseFunderPrivateKey(): Hex {
  const raw = process.env.PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "PRIVATE_KEY is required in backend/.env to fund an empty agent wallet with STT",
    );
  }
  const key = raw.startsWith("0x") ? raw : (`0x${raw}` as Hex);
  return key;
}

export async function fundAgentWalletSttIfEmpty(input: {
  userId: string;
  fundSttWei?: bigint;
}): Promise<FundAgentSttIfEmptyResult> {
  const fundSttWei = input.fundSttWei ?? DEFAULT_SMOKE_FUND_STT_WEI;
  const { walletAddress, balanceSttWei: balanceBeforeWei } =
    await getMarketplaceBuyerSttBalanceWei(input.userId);

  if (balanceBeforeWei > 0n) {
    return {
      funded: false,
      agentAddress: walletAddress,
      balanceBeforeWei,
      balanceAfterWei: balanceBeforeWei,
      reason: `Agent wallet already has ${balanceBeforeWei.toString()} STT wei — skipping fund`,
    };
  }

  const privateKey = parseFunderPrivateKey();
  const funder = privateKeyToAccount(privateKey);
  const { rpcHttp } = getSomniaAgentEnv();

  const publicClient = createMarketplaceTestnetPublicClient();
  const walletClient = createWalletClient({
    account: funder,
    chain: somniaAgentChain,
    transport: http(rpcHttp),
  });

  const funderBalance = await publicClient.getBalance({ address: funder.address });
  if (funderBalance < fundSttWei) {
    throw new Error(
      `Funder ${funder.address} has insufficient STT ` +
        `(balance ${funderBalance.toString()} wei, need ${fundSttWei.toString()} wei)`,
    );
  }

  const txHash = await walletClient.sendTransaction({
    account: funder,
    to: walletAddress,
    value: fundSttWei,
  });
  await waitForMarketplaceTestnetReceipt(publicClient, txHash);

  const balanceAfterWei = await publicClient.getBalance({ address: walletAddress });

  return {
    funded: true,
    agentAddress: walletAddress,
    balanceBeforeWei,
    balanceAfterWei,
    txHash,
  };
}
