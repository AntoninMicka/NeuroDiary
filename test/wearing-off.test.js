import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultEntry, TRACKING_HOURS } from "../src/domain/diary.js";
import { analyzeWearingOff } from "../src/services/wearingOff.js";
import { buildDoctorReportHtml } from "../src/services/doctorReport.js";

function createReliableEntry(dateIndex) {
  const entry = createDefaultEntry();
  for (const hourLabel of TRACKING_HOURS.slice(0, 18)) {
    entry.hours[hourLabel] = "on";
  }
  entry.hours["10"] = "partial";
  entry.hours["11"] = "off";
  entry.hours["12"] = "off";
  entry.hours["13"] = "on";
  entry.sleepQuality = "good";
  entry.overallStatus = "stable";
  entry.medications = [{
    id: `dose-${dateIndex}`,
    name: "Levodopa",
    dose: "100 mg",
    time: "12:00",
    planItemId: "noon-dose",
  }];
  return entry;
}

const treatmentPlan = [{
  id: "noon-dose",
  name: "Levodopa",
  dose: "100 mg",
  time: "12:00",
  validFrom: "2026-03-01",
  validTo: "",
}];

test("detects repeated pre-dose worsening after an earlier ON state", () => {
  const entries = {};
  for (let day = 1; day <= 7; day += 1) {
    entries[`2026-03-0${day}`] = createReliableEntry(day);
  }

  const result = analyzeWearingOff({
    entries,
    treatmentPlan,
    endDateKey: "2026-03-07",
    days: 7,
  });

  assert.equal(result.reliableDays, 7);
  assert.equal(result.evaluatedDoses, 7);
  assert.equal(result.candidateDoses, 7);
  assert.equal(result.candidatePercent, 100);
  assert.equal(result.medianResponseMinutes, 60);
  assert.equal(result.hasEnoughData, true);
  assert.equal(result.groups[0].candidatePercent, 100);
  assert.ok(result.recurringHours.some((pattern) => pattern.hourLabel === "11"));
});

test("ignores incomplete days even if they contain an OFF observation", () => {
  const entry = createDefaultEntry();
  entry.hours["11"] = "off";
  entry.medications = [{
    id: "dose",
    name: "Levodopa",
    dose: "100 mg",
    time: "12:00",
    planItemId: "noon-dose",
  }];

  const result = analyzeWearingOff({
    entries: { "2026-03-01": entry },
    treatmentPlan,
    endDateKey: "2026-03-01",
    days: 1,
  });

  assert.equal(result.reliableDays, 0);
  assert.equal(result.evaluatedDoses, 0);
  assert.equal(result.candidatePercent, null);
});

test("doctor report includes the quality-filtered wearing-off summary", () => {
  const entries = { "2026-03-01": createReliableEntry(1) };
  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
  });
  assert.match(html, /Orientační wearing-off pozorování/);
  assert.match(html, /nikoli diagnózu/);
});

test("doctor report can omit daily trend and wearing-off observations", () => {
  const entries = { "2026-03-01": createReliableEntry(1) };
  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
    includeDailyTrend: false,
    includeWearingOff: false,
  });
  assert.doesNotMatch(html, /<h3>Denni trend<\/h3>/);
  assert.doesNotMatch(html, /Orientační wearing-off pozorování/);
  assert.match(html, /<h3>Hodinovy souhrn<\/h3>/);
});

test("tracking axis ends at hour 23", () => {
  assert.equal(TRACKING_HOURS.at(-1), "23");
  assert.equal(TRACKING_HOURS.includes("24"), false);
});

test("doctor report renders 25-week hourly charts and marks treatment-plan changes", () => {
  const entries = { "2026-03-07": createReliableEntry(7) };
  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan: [{
      ...treatmentPlan[0],
      validFrom: "2026-02-15",
    }],
    selectedDate: "2026-03-07",
  });
  assert.doesNotMatch(html, /Nejcastejsi hodnota/);
  assert.match(html, /25x7 dni/);
  assert.match(html, /class="chart-plan-change"/);
  assert.match(html, /Od 15\. 02\. 2026: Levodopa 100 mg/);
  assert.equal((html.match(/class="weekly-hour-chart"/g) ?? []).length, TRACKING_HOURS.length);
});
