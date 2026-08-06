import test from "node:test";
import assert from "node:assert/strict";

import {
  createSyncRetryScheduler,
  getSyncRetryDelay,
} from "../src/services/syncRetry.js";

test("sync retry delay uses bounded exponential backoff", () => {
  assert.equal(getSyncRetryDelay(1), 5_000);
  assert.equal(getSyncRetryDelay(2), 10_000);
  assert.equal(getSyncRetryDelay(3), 20_000);
  assert.equal(getSyncRetryDelay(20), 300_000);
});

test("automatic sync retries a connection failure and resets after success", async () => {
  const scheduled = [];
  const outcomes = [false, false, true, false];
  const scheduler = createSyncRetryScheduler({
    task: async () => outcomes.shift(),
    setTimer(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimer() {},
  });

  assert.equal(await scheduler.run(), false);
  assert.equal(scheduled.shift().delay, 5_000);
  assert.equal(await scheduler.run(), false);
  assert.equal(scheduled.shift().delay, 10_000);
  assert.equal(await scheduler.run(), true);
  assert.equal(scheduler.getFailureCount(), 0);
  assert.equal(await scheduler.run(), false);
  assert.equal(scheduled.shift().delay, 5_000);
});
