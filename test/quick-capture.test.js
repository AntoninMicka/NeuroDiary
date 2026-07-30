import test from "node:test";
import assert from "node:assert/strict";

import {
  isQuickCaptureDateValid,
  getMedicationWindowStatus,
  roundDownToTimelineStep,
  QUICK_CAPTURE_WINDOW_MS,
} from "../src/services/quickCapture.js";

test("accepts the current time including seconds and milliseconds", () => {
  const now = new Date("2026-07-29T14:32:27.456Z");
  assert.equal(isQuickCaptureDateValid(now, now), true);
});

test("rounds timeline selections down to five minutes", () => {
  assert.equal(
    roundDownToTimelineStep(new Date("2026-07-29T14:32:27")).toTimeString().slice(0, 5),
    "14:30",
  );
});

test("rounds correctly across the midnight boundary", () => {
  const rounded = roundDownToTimelineStep(new Date("2026-07-30T00:02:59"));
  assert.equal(rounded.getDate(), 30);
  assert.equal(rounded.toTimeString().slice(0, 5), "00:00");
});

test("offers medication from ten minutes early through sixty minutes late", () => {
  const scheduled = new Date("2026-07-29T14:00:00");
  assert.equal(getMedicationWindowStatus(scheduled, new Date("2026-07-29T13:50:00")).isAvailable, true);
  assert.equal(getMedicationWindowStatus(scheduled, new Date("2026-07-29T15:00:00")).isAvailable, true);
  assert.equal(getMedicationWindowStatus(scheduled, new Date("2026-07-29T15:00:00.001")).isAvailable, false);
  assert.equal(getMedicationWindowStatus(scheduled, new Date("2026-07-29T13:49:59")).isAvailable, false);
  assert.equal(getMedicationWindowStatus(scheduled, new Date("2026-07-29T15:01:00")).isAvailable, false);
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
