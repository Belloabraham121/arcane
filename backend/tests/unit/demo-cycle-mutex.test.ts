import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acquireDemoCycleLock,
  isDemoWalletCycleRunning,
  releaseDemoCycleLock,
  resetDemoCycleMutexForTests,
} from "../../src/services/agents/demo-cycle-mutex.service";

describe("demo cycle mutex", () => {
  it("allows one holder at a time and queues the next", async () => {
    resetDemoCycleMutexForTests();

    await acquireDemoCycleLock("user-a");
    assert.equal(isDemoWalletCycleRunning(), true);

    const queued = acquireDemoCycleLock("user-b");
    assert.equal(isDemoWalletCycleRunning(), true);

    releaseDemoCycleLock("user-a");
    await queued;

    releaseDemoCycleLock("user-b");
    assert.equal(isDemoWalletCycleRunning(), false);
  });
});
