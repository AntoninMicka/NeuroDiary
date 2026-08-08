import { TRACKING_HOURS, UNDEFINED_ENTRY_VALUE, getTodayKey } from "../domain/diary.js";

const QUALITY_DEFINITIONS = {
  none: {
    key: "none",
    label: "Bez dat",
    description: "Pro tento den nejsou zaznamenány žádné údaje.",
  },
  incomplete: {
    key: "incomplete",
    label: "Neúplný den",
    description: "Data existuji, ale pro spolehlivou interpretaci jich je malo.",
  },
  sufficient: {
    key: "sufficient",
    label: "Dostatečná data",
    description: "Den ma dostatecne pokryti pro orientacni vyhodnoceni.",
  },
  complete: {
    key: "complete",
    label: "Kompletní den",
    description: "Den má souvislé hodinové pokrytí a vyplněný denní souhrn.",
  },
};

function hasSummaryValue(value) {
  return Boolean(value && value !== UNDEFINED_ENTRY_VALUE);
}

function getExpectedHourLabels(dateKey, todayDate, now) {
  if (dateKey < todayDate) {
    return TRACKING_HOURS;
  }
  if (dateKey > todayDate) {
    return [];
  }
  if (now.getHours() < 5) {
    return [];
  }
  const currentHour = Math.min(now.getHours(), 23);
  return TRACKING_HOURS.filter((hourLabel) => Number(hourLabel) <= currentHour);
}

function buildMissingRanges(labels) {
  if (labels.length === 0) {
    return [];
  }
  const ranges = [];
  let start = Number(labels[0]);
  let previous = start;
  for (const label of labels.slice(1)) {
    const current = Number(label);
    if (current !== previous + 1) {
      ranges.push(start === previous ? `${start}:00` : `${start}:00–${previous}:00`);
      start = current;
    }
    previous = current;
  }
  ranges.push(start === previous ? `${start}:00` : `${start}:00–${previous}:00`);
  return ranges;
}

export function evaluateDayQuality(
  entry,
  dateKey,
  { todayDate = getTodayKey(), now = new Date() } = {},
) {
  const expectedHourLabels = getExpectedHourLabels(dateKey, todayDate, now);
  const recordedHourLabels = expectedHourLabels.filter((hourLabel) => Boolean(entry?.hours?.[hourLabel]));
  const missingHourLabels = expectedHourLabels.filter((hourLabel) => !entry?.hours?.[hourLabel]);
  const hasSleepQuality = hasSummaryValue(entry?.sleepQuality);
  const hasOverallStatus = hasSummaryValue(entry?.overallStatus);
  const hasNotes = Boolean(entry?.notes?.trim());
  const medicationCount = entry?.medications?.length ?? 0;
  const hasAnyData =
    recordedHourLabels.length > 0
    || hasSleepQuality
    || hasOverallStatus
    || hasNotes
    || medicationCount > 0;
  const hourCoveragePercent =
    expectedHourLabels.length > 0
      ? Math.round((recordedHourLabels.length / expectedHourLabels.length) * 100)
      : 0;

  let qualityKey = "none";
  if (hasAnyData) {
    if (
      expectedHourLabels.length > 0
      && hourCoveragePercent >= 90
      && hasSleepQuality
      && hasOverallStatus
    ) {
      qualityKey = "complete";
    } else if (
      expectedHourLabels.length > 0
      && hourCoveragePercent >= 60
      && (hasSleepQuality || hasOverallStatus)
    ) {
      qualityKey = "sufficient";
    } else {
      qualityKey = "incomplete";
    }
  }

  const missingItems = [];
  if (missingHourLabels.length > 0) {
    missingItems.push(`Doplnit hodiny: ${buildMissingRanges(missingHourLabels).join(", ")}.`);
  }
  if (!hasSleepQuality) {
    missingItems.push("Doplnit kvalitu spánku.");
  }
  if (!hasOverallStatus) {
    missingItems.push("Doplnit celkove hodnoceni dne.");
  }

  return {
    ...QUALITY_DEFINITIONS[qualityKey],
    hasAnyData,
    expectedHourCount: expectedHourLabels.length,
    recordedHourCount: recordedHourLabels.length,
    hourCoveragePercent,
    missingHourLabels,
    missingRanges: buildMissingRanges(missingHourLabels),
    missingItems,
    hasSleepQuality,
    hasOverallStatus,
    hasNotes,
    medicationCount,
    isReliable: qualityKey === "sufficient" || qualityKey === "complete",
  };
}

export function summarizePeriodQuality(
  entries,
  dateKeys,
  { todayDate = getTodayKey(), now = new Date() } = {},
) {
  const days = dateKeys.map((dateKey) => ({
    dateKey,
    quality: evaluateDayQuality(entries[dateKey], dateKey, { todayDate, now }),
  }));
  const counts = { none: 0, incomplete: 0, sufficient: 0, complete: 0 };
  for (const day of days) {
    counts[day.quality.key] += 1;
  }
  const recordedDays = days.length - counts.none;
  const reliableDays = counts.sufficient + counts.complete;
  return {
    days,
    counts,
    recordedDays,
    reliableDays,
    recordedCoveragePercent: days.length > 0 ? Math.round((recordedDays / days.length) * 100) : 0,
    reliableCoveragePercent: days.length > 0 ? Math.round((reliableDays / days.length) * 100) : 0,
  };
}
