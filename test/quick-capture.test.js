import test from "node:test";
import assert from "node:assert/strict";

import {
  isQuickCaptureDateValid,
  QUICK_CAPTURE_WINDOW_MS,
} from "../src/services/quickCapture.js";

test("accepts the current time including seconds and milliseconds", () => {
  const now = new Date("2026-07-29T14:32:27.456Z");
  assert.equal(isQuickCaptureDateValid(now, now), true);
});

test("accepts times within the previous ten hours", () => {
  const now = new Date("2026-07-29T14:32:27.456Z");
  assert.equal(isQuickCaptureDateValid(new Date(now.getTime() - QUICK_CAPTURE_WINDOW_MS), now), true);
  assert.equal(isQuickCaptureDateValid(new Date(now.getTime() - 60_000), now), true);
});

test("rejects future, expired, and invalid times", () => {
  const now = new Date("2026-07-29T14:32:27.456Z");
  assert.equal(isQuickCaptureDateValid(new Date(now.getTime() + 1), now), false);
  assert.equal(isQuickCaptureDateValid(new Date(now.getTime() - QUICK_CAPTURE_WINDOW_MS - 1), now), false);
  assert.equal(isQuickCaptureDateValid(new Date("invalid"), now), false);
});
