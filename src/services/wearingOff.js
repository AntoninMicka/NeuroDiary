import { getTreatmentPlanForDate } from "../domain/diary.js";
import { analyzeMedicationAdherence } from "./adherence.js";
import { evaluateDayQuality } from "./dataQuality.js";
import { normalizeSingleLine } from "./validation.js";

const PRE_DOSE_WINDOW_MINUTES = 120;
const PRIOR_ON_LOOKBACK_MINUTES = 240;
const POST_DOSE_WINDOW_MINUTES = 180;
const WORSENING_STATES = new Set(["partial", "off"]);
const FAVORABLE_STATES = new Set(["on", "dyskinesia"]);

function shiftDateKey(dateKey, deltaDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function getDateKeys(endDateKey, days) {
  return Array.from({ length: days }, (_, index) =>
    shiftDateKey(endDateKey, index - days + 1),
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  return hours * 60 + minutes;
}

function hourLabelToMinutes(hourLabel) {
  return Number(hourLabel) * 60;
}

function getStateObservations(entry) {
  return Object.entries(entry?.hours ?? {})
    .filter(([, stateKey]) => Boolean(stateKey))
    .map(([hourLabel, stateKey]) => ({
      hourLabel,
      minutes: hourLabelToMinutes(hourLabel),
      stateKey,
    }))
    .sort((left, right) => left.minutes - right.minutes);
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function groupKey(planItem) {
  return [
    normalizeSingleLine(planItem.name).toLocaleLowerCase("cs-CZ"),
    normalizeSingleLine(planItem.dose).toLocaleLowerCase("cs-CZ"),
    planItem.time,
  ].join("|");
}

function analyzePlannedDose(entry, adherenceDose) {
  const planMinutes = timeToMinutes(adherenceDose.planItem.time);
  const observations = getStateObservations(entry);
  const preDoseObservations = observations.filter(
    (item) =>
      item.minutes >= planMinutes - PRE_DOSE_WINDOW_MINUTES
      && item.minutes < planMinutes,
  );
  const worseningObservations = preDoseObservations.filter((item) =>
    WORSENING_STATES.has(item.stateKey),
  );
  const firstWorsening = worseningObservations[0] ?? null;
  const precedingOn = firstWorsening
    ? observations.some(
      (item) =>
        FAVORABLE_STATES.has(item.stateKey)
        && item.minutes >= firstWorsening.minutes - PRIOR_ON_LOOKBACK_MINUTES
        && item.minutes < firstWorsening.minutes,
    )
    : false;

  let responseMinutes = null;
  if (adherenceDose.recordedMedication) {
    const recordedMinutes = timeToMinutes(adherenceDose.recordedMedication.time);
    const firstFavorableAfterDose = observations.find(
      (item) =>
        FAVORABLE_STATES.has(item.stateKey)
        && item.minutes >= recordedMinutes
        && item.minutes <= recordedMinutes + POST_DOSE_WINDOW_MINUTES,
    );
    if (firstFavorableAfterDose) {
      responseMinutes = Math.max(0, firstFavorableAfterDose.minutes - recordedMinutes);
    }
  }

  return {
    planItem: adherenceDose.planItem,
    recordedMedication: adherenceDose.recordedMedication,
    hasPreDoseData: preDoseObservations.length > 0,
    hasPreDoseWorsening: worseningObservations.length > 0,
    isWearingOffCandidate: worseningObservations.length > 0 && precedingOn,
    worseningState: firstWorsening?.stateKey ?? null,
    worseningHour: firstWorsening?.hourLabel ?? null,
    responseMinutes,
  };
}

export function analyzeWearingOff({
  entries = {},
  treatmentPlan = [],
  endDateKey,
  days = 30,
}) {
  const dateKeys = getDateKeys(endDateKey, days);
  const doseGroups = new Map();
  const hourPatterns = new Map();
  const allDoseObservations = [];
  let reliableDays = 0;

  for (const dateKey of dateKeys) {
    const entry = entries[dateKey];
    const quality = evaluateDayQuality(entry, dateKey);
    if (!quality.isReliable) {
      continue;
    }
    reliableDays += 1;

    for (const [hourLabel, stateKey] of Object.entries(entry.hours ?? {})) {
      if (!stateKey) {
        continue;
      }
      const pattern = hourPatterns.get(hourLabel) ?? {
        hourLabel,
        observedDays: 0,
        worseningDays: 0,
        offDays: 0,
      };
      pattern.observedDays += 1;
      if (WORSENING_STATES.has(stateKey)) {
        pattern.worseningDays += 1;
      }
      if (stateKey === "off") {
        pattern.offDays += 1;
      }
      hourPatterns.set(hourLabel, pattern);
    }

    const adherence = analyzeMedicationAdherence({
      treatmentPlan: getTreatmentPlanForDate(treatmentPlan, dateKey),
      recordedMedications: entry.medications ?? [],
      selectedDate: dateKey,
      todayDate: endDateKey,
      now: new Date(`${endDateKey}T23:59:00`),
    });

    for (const adherenceDose of adherence.plannedDoses) {
      const observation = {
        dateKey,
        ...analyzePlannedDose(entry, adherenceDose),
      };
      allDoseObservations.push(observation);
      const key = groupKey(observation.planItem);
      const group = doseGroups.get(key) ?? {
        key,
        name: observation.planItem.name,
        dose: observation.planItem.dose,
        time: observation.planItem.time,
        evaluatedCount: 0,
        worseningCount: 0,
        candidateCount: 0,
        responseMinutes: [],
      };
      if (observation.hasPreDoseData) {
        group.evaluatedCount += 1;
        if (observation.hasPreDoseWorsening) {
          group.worseningCount += 1;
        }
        if (observation.isWearingOffCandidate) {
          group.candidateCount += 1;
        }
      }
      if (observation.responseMinutes !== null) {
        group.responseMinutes.push(observation.responseMinutes);
      }
      doseGroups.set(key, group);
    }
  }

  const groups = [...doseGroups.values()]
    .map((group) => ({
      ...group,
      worseningPercent:
        group.evaluatedCount > 0
          ? Math.round((group.worseningCount / group.evaluatedCount) * 100)
          : null,
      candidatePercent:
        group.evaluatedCount > 0
          ? Math.round((group.candidateCount / group.evaluatedCount) * 100)
          : null,
      medianResponseMinutes: median(group.responseMinutes),
      responseSampleCount: group.responseMinutes.length,
    }))
    .sort((left, right) => left.time.localeCompare(right.time));
  const recurringHours = [...hourPatterns.values()]
    .map((pattern) => ({
      ...pattern,
      worseningPercent: Math.round((pattern.worseningDays / pattern.observedDays) * 100),
      offPercent: Math.round((pattern.offDays / pattern.observedDays) * 100),
    }))
    .filter((pattern) => pattern.observedDays >= 3 && pattern.worseningPercent >= 50)
    .sort(
      (left, right) =>
        right.worseningPercent - left.worseningPercent
        || Number(left.hourLabel) - Number(right.hourLabel),
    );
  const evaluatedDoses = groups.reduce((sum, group) => sum + group.evaluatedCount, 0);
  const candidateDoses = groups.reduce((sum, group) => sum + group.candidateCount, 0);
  const responseMinutes = allDoseObservations
    .map((item) => item.responseMinutes)
    .filter((value) => value !== null);

  return {
    fromDate: dateKeys[0],
    toDate: dateKeys.at(-1),
    days,
    reliableDays,
    evaluatedDoses,
    candidateDoses,
    candidatePercent:
      evaluatedDoses > 0 ? Math.round((candidateDoses / evaluatedDoses) * 100) : null,
    medianResponseMinutes: median(responseMinutes),
    responseSampleCount: responseMinutes.length,
    groups,
    recurringHours,
    hasEnoughData: reliableDays >= 7 && evaluatedDoses >= 5,
  };
}
