export const QUICK_CAPTURE_WINDOW_MS = 10 * 60 * 60 * 1000;
export const MEDICATION_EARLY_MINUTES = 10;
export const MEDICATION_LATE_MINUTES = 60;
export const TIMELINE_STEP_MINUTES = 5;

export function isQuickCaptureDateValid(recordedAt, now = new Date()) {
  const timestamp = recordedAt?.getTime();
  const nowTimestamp = now?.getTime();

  return Number.isFinite(timestamp)
    && Number.isFinite(nowTimestamp)
    && timestamp >= nowTimestamp - QUICK_CAPTURE_WINDOW_MS
    && timestamp <= nowTimestamp;
}

export function roundDownToTimelineStep(date, stepMinutes = TIMELINE_STEP_MINUTES) {
  const rounded = new Date(date);
  rounded.setMinutes(Math.floor(rounded.getMinutes() / stepMinutes) * stepMinutes, 0, 0);
  return rounded;
}

export function getPlannedDoseDate(dateKey, time) {
  return new Date(`${dateKey}T${time}:00`);
}

export function getMedicationWindowStatus(scheduledAt, now = new Date()) {
  const differenceMs = now.getTime() - scheduledAt.getTime();
  const differenceMinutes = Math.floor(differenceMs / 60_000);
  const isAvailable =
    differenceMs >= -MEDICATION_EARLY_MINUTES * 60_000
    && differenceMs <= MEDICATION_LATE_MINUTES * 60_000;
  let label = "";
  if (differenceMinutes < 0) {
    label = `za ${Math.abs(differenceMinutes)} min`;
  } else if (differenceMinutes === 0) {
    label = "nyni";
  } else {
    label = `zpozdeni ${differenceMinutes} min`;
  }
  return { differenceMinutes, isAvailable, label };
}
