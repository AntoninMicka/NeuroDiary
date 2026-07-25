import { normalizeSingleLine } from "./validation.js";

export const ADHERENCE_TOLERANCE_MINUTES = 30;

function timeToMinutes(value) {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  return hours * 60 + minutes;
}

function medicationIdentity(item) {
  return [
    normalizeSingleLine(item?.name).toLocaleLowerCase("cs-CZ"),
    normalizeSingleLine(item?.dose).toLocaleLowerCase("cs-CZ"),
  ].join("|");
}

function getTimingStatus(differenceMinutes) {
  if (differenceMinutes < -ADHERENCE_TOLERANCE_MINUTES) {
    return { key: "early", label: `Uzita o ${Math.abs(differenceMinutes)} min drive` };
  }
  if (differenceMinutes > ADHERENCE_TOLERANCE_MINUTES) {
    return { key: "late", label: `Uzita o ${differenceMinutes} min pozdeji` };
  }
  return { key: "on-time", label: "Uzita vcas" };
}

export function analyzeMedicationAdherence({
  treatmentPlan = [],
  recordedMedications = [],
  selectedDate,
  todayDate,
  now = new Date(),
}) {
  const usedMedicationIds = new Set();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayKey = todayDate;

  const plannedDoses = [...treatmentPlan]
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((planItem) => {
      const directMatch = recordedMedications.find(
        (item) => !usedMedicationIds.has(item.id) && item.planItemId === planItem.id,
      );
      const legacyCandidates = recordedMedications
        .filter(
          (item) =>
            !usedMedicationIds.has(item.id)
            && !item.planItemId
            && medicationIdentity(item) === medicationIdentity(planItem),
        )
        .sort(
          (left, right) =>
            Math.abs(timeToMinutes(left.time) - timeToMinutes(planItem.time))
            - Math.abs(timeToMinutes(right.time) - timeToMinutes(planItem.time)),
        );
      const recordedMedication = directMatch ?? legacyCandidates[0] ?? null;

      if (recordedMedication) {
        usedMedicationIds.add(recordedMedication.id);
        const differenceMinutes = timeToMinutes(recordedMedication.time) - timeToMinutes(planItem.time);
        const timing = getTimingStatus(differenceMinutes);
        return {
          planItem,
          recordedMedication,
          differenceMinutes,
          statusKey: timing.key,
          statusLabel: timing.label,
        };
      }

      const isPastDate = selectedDate < todayKey;
      const isPastDueToday =
        selectedDate === todayKey
        && nowMinutes > timeToMinutes(planItem.time) + ADHERENCE_TOLERANCE_MINUTES;
      const isMissed = isPastDate || isPastDueToday;
      return {
        planItem,
        recordedMedication: null,
        differenceMinutes: null,
        statusKey: isMissed ? "missed" : "upcoming",
        statusLabel: isMissed ? "Vynechana" : "Ceka na uziti",
      };
    });

  const unplannedDoses = recordedMedications.filter((item) => !usedMedicationIds.has(item.id));
  const takenCount = plannedDoses.filter((item) =>
    ["on-time", "early", "late"].includes(item.statusKey),
  ).length;
  const missedCount = plannedDoses.filter((item) => item.statusKey === "missed").length;
  const upcomingCount = plannedDoses.filter((item) => item.statusKey === "upcoming").length;
  const evaluatedCount = takenCount + missedCount;

  return {
    plannedDoses,
    unplannedDoses,
    summary: {
      plannedCount: plannedDoses.length,
      takenCount,
      missedCount,
      upcomingCount,
      unplannedCount: unplannedDoses.length,
      adherencePercent: evaluatedCount > 0 ? Math.round((takenCount / evaluatedCount) * 100) : null,
    },
  };
}
