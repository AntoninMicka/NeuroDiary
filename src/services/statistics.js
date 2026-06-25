import { getStateDefinition } from "../domain/diary.js";

const TRACKED_SUMMARY_STATES = ["on", "partial", "off", "sleep"];

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, deltaDays) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatDateKey(date);
}

export function summarizeHours(hours = {}) {
  return Object.values(hours).reduce((accumulator, item) => {
    accumulator[item] = (accumulator[item] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function getDominantState(hourCounts) {
  return Object.entries(hourCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export function analyzeEntry(entry) {
  const hourCounts = summarizeHours(entry?.hours ?? {});
  const dominantState = getDominantState(hourCounts);

  return {
    hourCounts,
    dominantState,
    dominantStateLabel: dominantState ? getStateDefinition(dominantState).label : "Bez dat",
    medicationCount: entry?.medications?.length ?? 0,
    noteStatus: entry?.notes?.trim() ? "poznamky vyplneny" : "bez poznamek",
  };
}

export function analyzePeriod(entries, endDateKey, days = 7) {
  const dateKeys = getPeriodDateKeys(endDateKey, days);

  const totals = TRACKED_SUMMARY_STATES.reduce((accumulator, stateKey) => {
    accumulator[stateKey] = 0;
    return accumulator;
  }, {});

  const dominantStateDays = TRACKED_SUMMARY_STATES.reduce((accumulator, stateKey) => {
    accumulator[stateKey] = 0;
    return accumulator;
  }, {});

  let recordedDays = 0;
  let medicationTotal = 0;

  for (const dateKey of dateKeys) {
    const entry = entries[dateKey];
    if (!entry) {
      continue;
    }

    recordedDays += 1;
    const analysis = analyzeEntry(entry);
    medicationTotal += analysis.medicationCount;

    for (const stateKey of TRACKED_SUMMARY_STATES) {
      totals[stateKey] += analysis.hourCounts[stateKey] ?? 0;
    }

    if (analysis.dominantState && dominantStateDays[analysis.dominantState] !== undefined) {
      dominantStateDays[analysis.dominantState] += 1;
    }
  }

  return {
    fromDate: dateKeys[0],
    toDate: dateKeys[dateKeys.length - 1],
    trackedDays: days,
    recordedDays,
    medicationTotal,
    averageMedicationCount: recordedDays > 0 ? medicationTotal / recordedDays : 0,
    totals,
    dominantStateDays,
    dominantState:
      getDominantState(dominantStateDays) ?? (recordedDays > 0 ? getDominantState(totals) : null),
  };
}

export function getPeriodDateKeys(endDateKey, days = 7) {
  const dateKeys = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    dateKeys.push(shiftDateKey(endDateKey, -index));
  }
  return dateKeys;
}

export function buildMetricSeries(entries, endDateKey, days = 7) {
  return getPeriodDateKeys(endDateKey, days).map((dateKey) => {
    const entry = entries[dateKey];
    const analysis = entry ? analyzeEntry(entry) : null;

    return {
      dateKey,
      hasEntry: Boolean(entry),
      on: analysis?.hourCounts.on ?? 0,
      partial: analysis?.hourCounts.partial ?? 0,
      off: analysis?.hourCounts.off ?? 0,
      sleep: analysis?.hourCounts.sleep ?? 0,
      medications: analysis?.medicationCount ?? 0,
    };
  });
}
