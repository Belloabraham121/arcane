import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEMO_AGENT_WALLET,
} from "../../src/config/env";
import { toAuthUserProfile } from "../../src/services/auth/user-account.service";

describe("user account profile", () => {
  it("toAuthUserProfile exposes live wallet, demo wallet, and null mode", () => {
    const profile = toAuthUserProfile({
      id: "user-1",
      email: "test@example.com",
      walletAddress: "0xLiveWallet00000000000000000000000001",
      accountMode: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    assert.equal(profile.accountMode, null);
    assert.equal(
      profile.liveWalletAddress,
      "0xLiveWallet00000000000000000000000001",
    );
    assert.equal(profile.demoWalletAddress, DEFAULT_DEMO_AGENT_WALLET);
    assert.equal(profile.walletAddress, profile.liveWalletAddress);
  });
});
