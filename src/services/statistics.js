import { HOUR_STATES, getStateDefinition } from "../domain/diary.js";
import { analyzeMedicationAdherence } from "./adherence.js";
import { evaluateDayQuality, summarizePeriodQuality } from "./dataQuality.js";

const TRACKED_SUMMARY_STATES = HOUR_STATES.map((state) => state.key);

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
    if (!HOUR_STATES.some((state) => state.key === item)) {
      return accumulator;
    }
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
  const periodQuality = summarizePeriodQuality(entries, dateKeys);

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
    const quality = evaluateDayQuality(entry, dateKey);
    if (!entry || !quality.hasAnyData) {
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
    reliableDays: periodQuality.reliableDays,
    quality: periodQuality,
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
      hasEntry: Boolean(entry) && evaluateDayQuality(entry, dateKey).hasAnyData,
      qualityKey: evaluateDayQuality(entry, dateKey).key,
      on: analysis?.hourCounts.on ?? 0,
      dyskinesia: analysis?.hourCounts.dyskinesia ?? 0,
      partial: analysis?.hourCounts.partial ?? 0,
      off: analysis?.hourCounts.off ?? 0,
      sleep: analysis?.hourCounts.sleep ?? 0,
      medications: analysis?.medicationCount ?? 0,
    };
  });
}

export function buildStateDistribution(hourCounts = {}) {
  const total = TRACKED_SUMMARY_STATES.reduce((sum, stateKey) => sum + (hourCounts[stateKey] ?? 0), 0);

  return HOUR_STATES.map((state) => {
    const hours = hourCounts[state.key] ?? 0;
    const percent = total > 0 ? (hours / total) * 100 : 0;

    return {
      key: state.key,
      label: state.label,
      shortLabel: state.shortLabel,
      hours,
      percent,
    };
  });
}

function sumStateHours(target, source) {
  for (const stateKey of TRACKED_SUMMARY_STATES) {
    target[stateKey] += source[stateKey] ?? 0;
  }
}

function createEmptyStateTotals() {
  return TRACKED_SUMMARY_STATES.reduce((totals, stateKey) => {
    totals[stateKey] = 0;
    return totals;
  }, {});
}

export function analyzeLongTermTrends(entries, treatmentPlan, endDateKey, days = 90) {
  const dateKeys = getPeriodDateKeys(endDateKey, days);
  const daily = dateKeys.map((dateKey) => {
    const entry = entries[dateKey];
    const analysis = entry ? analyzeEntry(entry) : null;
    const trackedHours = analysis
      ? Object.values(analysis.hourCounts).reduce((sum, count) => sum + count, 0)
      : 0;
    const quality = evaluateDayQuality(entry, dateKey);
    const adherence = analyzeMedicationAdherence({
      treatmentPlan: quality.hasAnyData ? treatmentPlan : [],
      recordedMedications: entry?.medications ?? [],
      selectedDate: dateKey,
      todayDate: endDateKey,
      now: new Date(`${endDateKey}T23:59:00`),
    });

    return {
      dateKey,
      hasData: quality.hasAnyData,
      quality,
      trackedHours,
      hourCounts: analysis?.hourCounts ?? {},
      medicationCount: analysis?.medicationCount ?? 0,
      adherence,
    };
  });

  const buckets = [];
  for (let index = 0; index < daily.length; index += 7) {
    const bucketDays = daily.slice(index, index + 7);
    const totals = createEmptyStateTotals();
    let recordedDays = 0;
    let trackedHours = 0;
    let medicationCount = 0;
    let takenCount = 0;
    let missedCount = 0;
    let reliableDays = 0;

    for (const day of bucketDays) {
      if (day.hasData) {
        recordedDays += 1;
      }
      if (day.quality.isReliable) {
        reliableDays += 1;
      }
      trackedHours += day.trackedHours;
      medicationCount += day.medicationCount;
      takenCount += day.adherence.summary.takenCount;
      missedCount += day.adherence.summary.missedCount;
      sumStateHours(totals, day.hourCounts);
    }

    const evaluatedDoses = takenCount + missedCount;
    buckets.push({
      fromDate: bucketDays[0].dateKey,
      toDate: bucketDays.at(-1).dateKey,
      dayCount: bucketDays.length,
      recordedDays,
      reliableDays,
      trackedHours,
      medicationCount,
      totals,
      distribution: buildStateDistribution(totals),
      adherencePercent: evaluatedDoses > 0 ? Math.round((takenCount / evaluatedDoses) * 100) : null,
    });
  }

  const midpoint = Math.floor(daily.length / 2);
  const summarizeHalf = (half) => {
    const totals = createEmptyStateTotals();
    let recordedDays = 0;
    let trackedHours = 0;
    for (const day of half) {
      if (day.hasData) {
        recordedDays += 1;
      }
      trackedHours += day.trackedHours;
      sumStateHours(totals, day.hourCounts);
    }
    const motorHours = (totals.on ?? 0) + (totals.partial ?? 0) + (totals.off ?? 0) + (totals.dyskinesia ?? 0);
    return {
      recordedDays,
      trackedHours,
      onPercent: motorHours > 0 ? ((totals.on ?? 0) / motorHours) * 100 : null,
      offPercent: motorHours > 0 ? ((totals.off ?? 0) / motorHours) * 100 : null,
    };
  };
  const firstHalf = summarizeHalf(daily.slice(0, midpoint));
  const secondHalf = summarizeHalf(daily.slice(midpoint));
  const recordedDays = daily.filter((day) => day.hasData).length;
  const reliableDays = daily.filter((day) => day.quality.isReliable).length;
  const trackedHours = daily.reduce((sum, day) => sum + day.trackedHours, 0);

  return {
    fromDate: dateKeys[0],
    toDate: dateKeys.at(-1),
    days,
    recordedDays,
    reliableDays,
    coveragePercent: Math.round((recordedDays / days) * 100),
    reliableCoveragePercent: Math.round((reliableDays / days) * 100),
    averageTrackedHours: recordedDays > 0 ? trackedHours / recordedDays : 0,
    buckets,
    firstHalf,
    secondHalf,
    onChange:
      firstHalf.onPercent === null || secondHalf.onPercent === null
        ? null
        : secondHalf.onPercent - firstHalf.onPercent,
    offChange:
      firstHalf.offPercent === null || secondHalf.offPercent === null
        ? null
        : secondHalf.offPercent - firstHalf.offPercent,
  };
}
