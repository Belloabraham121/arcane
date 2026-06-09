import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import {
  DEFAULT_DEMO_AGENT_WALLET,
  getDemoEnv,
} from "../../src/config/env";
import {
  resolveTradingRpc,
  resolveTradingWallet,
} from "../../src/services/agents/trading-wallet-context.service";

const LIVE_WALLET = "0x1111111111111111111111111111111111111111" as Address;

describe("trading wallet resolution", () => {
  it("resolveTradingWallet uses demo agent wallet for demo mode", () => {
    const resolved = resolveTradingWallet({
      accountMode: "demo",
      walletAddress: LIVE_WALLET,
    });
    assert.equal(resolved.walletAddress, getDemoEnv().agentWallet);
    assert.equal(resolved.walletAddress, DEFAULT_DEMO_AGENT_WALLET);
    assert.equal(resolved.rpcMode, "fork");
  });

  it("resolveTradingWallet uses user wallet for live mode", () => {
    const resolved = resolveTradingWallet({
      accountMode: "live",
      walletAddress: LIVE_WALLET,
    });
    assert.equal(resolved.walletAddress, LIVE_WALLET);
    assert.equal(resolved.rpcMode, "mainnet");
  });

  it("resolveTradingRpc maps account mode to RPC rail", () => {
    assert.equal(resolveTradingRpc("demo"), "fork");
    assert.equal(resolveTradingRpc("live"), "mainnet");
  });
});
