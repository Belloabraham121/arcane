import { formatUnits } from "viem";
import { getDemoEnv } from "../../config/env";
import { getQuickSwapBundle } from "../../config/quickswap";
import { DEFAULT_DEMO_DEPOSIT_USD } from "../agents/strategy.types";
import { defaultForkTransfers } from "../dev/anvil-fork.service";

export type DemoPreviewBalance = {
  symbol: string;
  formatted: string;
  note: string;
};

export type DemoPreview = {
  demoWalletAddress: string;
  chainLabel: string;
  description: string;
  depositAmountUsd: number;
  seededBalances: DemoPreviewBalance[];
  anvilRequired: boolean;
};

function formatTransferAmount(symbol: string, amount: bigint): string {
  const bundle = getQuickSwapBundle(5031);
  const token = bundle.tokens.find((t) => t.symbol === symbol);
  const decimals = token?.decimals ?? 18;
  const formatted = formatUnits(amount, decimals);
  if (formatted.includes(".")) {
    return formatted.replace(/\.?0+$/, "");
  }
  return formatted;
}

/** Static preview of demo fork seed balances (whale impersonation / anvil_deal). */
export function getDemoPreview(
  depositAmountUsd = DEFAULT_DEMO_DEPOSIT_USD,
): DemoPreview {
  const demoEnv = getDemoEnv();
  const transfers = defaultForkTransfers(depositAmountUsd);

  return {
    demoWalletAddress: demoEnv.agentWallet,
    chainLabel: "Anvil fork (paper trading)",
    description:
      "Shared simulation wallet pre-funded on a local Somnia mainnet fork. Same agent behavior as live — no real funds.",
    depositAmountUsd,
    anvilRequired: true,
    seededBalances: transfers.map((transfer) => ({
      symbol: transfer.symbol,
      formatted: formatTransferAmount(transfer.symbol, transfer.amount),
      note:
        transfer.symbol === "USDCe"
          ? "Stablecoin seed (~$1 each)"
          : "Pool token seed for swaps",
    })),
  };
}
