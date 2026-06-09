import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tradingSocketEventMatchesMode } from "../../src/websocket/trading-socket-mode";

describe("trading socket account mode filter", () => {
  it("allows all events when no filter is set", () => {
    assert.equal(tradingSocketEventMatchesMode("demo", undefined), true);
    assert.equal(tradingSocketEventMatchesMode("live", undefined), true);
    assert.equal(tradingSocketEventMatchesMode(undefined, undefined), true);
  });

  it("drops events when accountMode does not match filter", () => {
    assert.equal(tradingSocketEventMatchesMode("demo", "live"), false);
    assert.equal(tradingSocketEventMatchesMode("live", "demo"), false);
    assert.equal(tradingSocketEventMatchesMode(undefined, "demo"), false);
  });

  it("accepts events when accountMode matches filter", () => {
    assert.equal(tradingSocketEventMatchesMode("demo", "demo"), true);
    assert.equal(tradingSocketEventMatchesMode("live", "live"), true);
  });
});
