import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultEntry, TRACKING_HOURS } from "../src/domain/diary.js";
import { evaluateDayQuality, summarizePeriodQuality } from "../src/services/dataQuality.js";
import { analyzeLongTermTrends, analyzePeriod } from "../src/services/statistics.js";

function entryWithHourCount(count) {
  const entry = createDefaultEntry();
  for (const hourLabel of TRACKING_HOURS.slice(0, count)) {
    entry.hours[hourLabel] = "on";
  }
  return entry;
}

test("classifies a truly empty entry as no data", () => {
  const quality = evaluateDayQuality(createDefaultEntry(), "2026-01-01", {
    todayDate: "2026-01-02",
  });
  assert.equal(quality.key, "none");
  assert.equal(quality.hasAnyData, false);
});

test("requires broad hour coverage and both summaries for a complete historical day", () => {
  const entry = entryWithHourCount(18);
  entry.sleepQuality = "good";
  entry.overallStatus = "stable";
  const quality = evaluateDayQuality(entry, "2026-01-01", {
    todayDate: "2026-01-02",
  });
  assert.equal(quality.key, "complete");
  assert.equal(quality.hourCoveragePercent, 90);
});

test("classifies partial but usable coverage as sufficient", () => {
  const entry = entryWithHourCount(12);
  entry.overallStatus = "stable";
  const quality = evaluateDayQuality(entry, "2026-01-01", {
    todayDate: "2026-01-02",
  });
  assert.equal(quality.key, "sufficient");
  assert.equal(quality.isReliable, true);
});

test("reports contiguous missing-hour ranges", () => {
  const entry = entryWithHourCount(20);
  entry.hours["8"] = null;
  entry.hours["9"] = null;
  entry.hours["15"] = null;
  const quality = evaluateDayQuality(entry, "2026-01-01", {
    todayDate: "2026-01-02",
  });
  assert.deepEqual(quality.missingRanges, ["8:00–9:00", "15:00"]);
});

test("today only expects hours that have already started", () => {
  const entry = entryWithHourCount(4);
  const quality = evaluateDayQuality(entry, "2026-01-02", {
    todayDate: "2026-01-02",
    now: new Date("2026-01-02T08:30:00"),
  });
  assert.equal(quality.expectedHourCount, 4);
  assert.equal(quality.hourCoveragePercent, 100);
});

test("period summaries do not count an automatically created empty entry", () => {
  const fullEntry = entryWithHourCount(18);
  fullEntry.sleepQuality = "good";
  fullEntry.overallStatus = "stable";
  const entries = {
    "2026-01-01": fullEntry,
    "2026-01-02": createDefaultEntry(),
  };
  const quality = summarizePeriodQuality(entries, ["2026-01-01", "2026-01-02"], {
    todayDate: "2026-01-03",
  });
  assert.equal(quality.recordedDays, 1);
  assert.equal(quality.reliableDays, 1);

  const analysis = analyzePeriod(entries, "2026-01-02", 2);
  assert.equal(analysis.recordedDays, 1);
});

test("an empty day is not interpreted as missed medication", () => {
  const result = analyzeLongTermTrends(
    { "2026-01-02": createDefaultEntry() },
    [{ id: "plan", name: "Lék", dose: "1", time: "08:00", validFrom: "2026-01-01", validTo: "" }],
    "2026-01-02",
    1,
  );
  assert.equal(result.buckets[0].adherencePercent, null);
  assert.equal(result.buckets[0].recordedDays, 0);
});
