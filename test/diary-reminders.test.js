import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultEntry } from "../src/domain/diary.js";
import { shouldRemindToCompleteDiary } from "../src/services/diaryReminders.js";

test("diary reminder waits for configured time and skips a complete day", () => {
  const entry = createDefaultEntry();
  const settings = { enabled: true, time: "20:00" };
  assert.equal(shouldRemindToCompleteDiary({ entry, dateKey: "2026-08-06", settings, now: new Date("2026-08-06T19:59:00") }), false);
  assert.equal(shouldRemindToCompleteDiary({ entry, dateKey: "2026-08-06", settings, now: new Date("2026-08-06T20:01:00") }), true);

  for (let hour = 5; hour <= 20; hour += 1) entry.hours[String(hour)] = "on";
  entry.sleepQuality = "good";
  entry.overallStatus = "stable";
  assert.equal(shouldRemindToCompleteDiary({ entry, dateKey: "2026-08-06", settings, now: new Date("2026-08-06T20:01:00") }), false);
});
