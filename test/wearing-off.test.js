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

test("doctor report includes descriptive day and state summaries without wearing-off", () => {
  const entries = { "2026-03-01": createReliableEntry(1) };
  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
  });
  assert.doesNotMatch(html, /Orientační wearing-off pozorování/);
  assert.match(html, /Souhrn dnů a stavů/);
  assert.match(html, /<h3>Denní trend<\/h3>/);
  assert.match(html, /<h3>Hodinový souhrn<\/h3>/);
  assert.equal((html.match(/class="weekly-hour-chart"/g) ?? []).length, TRACKING_HOURS.length);
  assert.doesNotMatch(html, /Průměr dávek/);
});

test("doctor report keeps clinical interpretations disabled", () => {
  const entries = { "2026-03-01": createReliableEntry(1) };
  const html = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
  });
  assert.doesNotMatch(html, /Orientační wearing-off pozorování/);
  assert.doesNotMatch(html, /Změna léčebného plánu/);
  assert.doesNotMatch(html, /class="chart-plan-change"/);
});

test("doctor report can disable every page after the first one", () => {
  const html = buildDoctorReportHtml({
    entries: { "2026-03-01": createReliableEntry(1) },
    treatmentPlan,
    selectedDate: "2026-03-01",
    includeDayStateSummary: false,
    includeDailyTrend: false,
    includeHourlySummary: false,
    includeWeeklyCharts: false,
  });

  assert.doesNotMatch(html, /class="sheet analysis-page"/);
  assert.doesNotMatch(html, /class="weekly-hour-chart"/);
});

test("doctor report controls descriptive sections independently", () => {
  const html = buildDoctorReportHtml({
    entries: { "2026-03-01": createReliableEntry(1) },
    treatmentPlan,
    selectedDate: "2026-03-01",
    includeDayStateSummary: false,
    includeDailyTrend: true,
    includeHourlySummary: false,
    includeWeeklyCharts: true,
  });

  assert.doesNotMatch(html, /class="analysis-cards"/);
  assert.match(html, /<h3>Denní trend<\/h3>/);
  assert.doesNotMatch(html, /<h3>Hodinový souhrn<\/h3>/);
  assert.equal((html.match(/class="weekly-hour-chart"/g) ?? []).length, TRACKING_HOURS.length);
});

test("doctor report excludes today unless including it is enabled", () => {
  const entries = {
    "2026-03-01": { ...createReliableEntry(1), notes: "TODAY_ONLY_NOTE" },
    "2026-02-28": { ...createReliableEntry(1), notes: "YESTERDAY_NOTE" },
  };
  const withoutToday = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
    todayDate: "2026-03-01",
    includeToday: false,
    skipEmptyDays: false,
  });
  const withToday = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-01",
    todayDate: "2026-03-01",
    includeToday: true,
    skipEmptyDays: false,
  });

  assert.doesNotMatch(withoutToday, /TODAY_ONLY_NOTE/);
  assert.match(withoutToday, /YESTERDAY_NOTE/);
  assert.match(withoutToday, /25\. 02\. 2026 - 28\. 02\. 2026/);
  assert.match(withToday, /TODAY_ONLY_NOTE/);
  assert.match(withToday, /26\. 02\. 2026 - 01\. 03\. 2026/);
});

test("doctor report skips empty first-page days by default and can include calendar gaps", () => {
  const entries = {
    "2026-03-01": createReliableEntry(1),
    "2026-03-03": createReliableEntry(3),
    "2026-03-04": createDefaultEntry(),
    "2026-03-05": createReliableEntry(5),
  };

  const skipping = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-05",
  });
  const including = buildDoctorReportHtml({
    entries,
    treatmentPlan,
    selectedDate: "2026-03-05",
    skipEmptyDays: false,
  });

  assert.match(skipping, /01\. 03\. 2026 - 05\. 03\. 2026/);
  assert.match(including, /02\. 03\. 2026 - 05\. 03\. 2026/);
});

test("doctor report colors medication names consistently and separates colliding labels into two lanes", () => {
  const entry = createReliableEntry(1);
  entry.medications = [
    { id: "a", name: "Levodopa", dose: "100 mg", time: "08:00" },
    { id: "b", name: "Pramipexol", dose: "0.7 mg", time: "08:30" },
    { id: "c", name: "levodopa", dose: "50 mg", time: "12:00" },
  ];
  const html = buildDoctorReportHtml({
    entries: { "2026-03-01": entry },
    treatmentPlan,
    selectedDate: "2026-03-01",
  });

  const medicationMarkers = [...html.matchAll(
    /--medication-color: ([^;]+);">\s*<span class="medication-dot"><\/span>\s*<span class="medication-caption">\s*<strong>([^<]+)<\/strong>/g,
  )].map((match) => ({ color: match[1], name: match[2] }));
  const levodopaColors = medicationMarkers
    .filter((item) => item.name.toLowerCase() === "levodopa")
    .map((item) => item.color);
  const pramipexolColor = medicationMarkers.find((item) => item.name === "Pramipexol")?.color;

  assert.deepEqual(levodopaColors, [levodopaColors[0], levodopaColors[0]]);
  assert.notEqual(levodopaColors[0], pramipexolColor);
  assert.match(html, /medication-marker medication-lane-0[^>]*>[\s\S]*?<strong>Levodopa<\/strong>/);
  assert.match(html, /medication-marker medication-lane-1[^>]*>[\s\S]*?<strong>Pramipexol<\/strong>/);
});

test("tracking axis ends at hour 23", () => {
  assert.equal(TRACKING_HOURS.at(-1), "23");
  assert.equal(TRACKING_HOURS.includes("24"), false);
});

test("doctor report renders descriptive weekly state charts without treatment markers", () => {
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
  assert.match(html, /25× 7 dní/);
  assert.doesNotMatch(html, /class="chart-plan-change"/);
  assert.doesNotMatch(html, /Od 15\. 02\. 2026: Levodopa 100 mg/);
  assert.equal((html.match(/class="weekly-hour-chart"/g) ?? []).length, TRACKING_HOURS.length);
});
