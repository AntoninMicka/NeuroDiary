import { normalizeSingleLine } from "./validation.js";
import { getTreatmentPlanForDate } from "../domain/diary.js";

const SETTINGS_STORAGE_KEY = "neurodiary-medication-reminders-v1";
const FIRED_STORAGE_KEY = "neurodiary-medication-reminders-fired-v1";

export function createDefaultMedicationReminderSettings() {
  return {
    enabled: false,
    leadMinutes: 0,
    webPushEnabled: false,
  };
}

export function loadMedicationReminderSettings() {
  try {
    return {
      ...createDefaultMedicationReminderSettings(),
      ...JSON.parse(globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    };
  } catch {
    return createDefaultMedicationReminderSettings();
  }
}

export function saveMedicationReminderSettings(settings) {
  const nextSettings = {
    enabled: settings.enabled === true,
    webPushEnabled: settings.webPushEnabled === true,
    leadMinutes: [0, 5, 10, 15, 30].includes(Number(settings.leadMinutes))
      ? Number(settings.leadMinutes)
      : 0,
  };
  globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function canUseMedicationNotifications() {
  return Boolean(
    globalThis.isSecureContext
    && "Notification" in globalThis
    && globalThis.navigator?.serviceWorker,
  );
}

export function getMedicationNotificationPermission() {
  return "Notification" in globalThis ? globalThis.Notification.permission : "unsupported";
}

export async function requestMedicationNotificationPermission() {
  if (!canUseMedicationNotifications()) {
    return "unsupported";
  }
  return globalThis.Notification.requestPermission();
}

function loadFiredReminders() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(FIRED_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveFiredReminders(firedReminders) {
  const recentReminders = Object.fromEntries(
    Object.entries(firedReminders).filter(([, firedAt]) => {
      const age = Date.now() - Date.parse(firedAt);
      return age >= 0 && age < 8 * 24 * 60 * 60 * 1000;
    }),
  );
  globalThis.localStorage?.setItem(FIRED_STORAGE_KEY, JSON.stringify(recentReminders));
  return recentReminders;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  return hours * 60 + minutes;
}

function wasPlanItemRecorded(planItem, recordedMedications) {
  const planKey = `${normalizeSingleLine(planItem.name).toLocaleLowerCase("cs-CZ")}|${normalizeSingleLine(planItem.dose).toLocaleLowerCase("cs-CZ")}`;
  return recordedMedications.some(
    (item) =>
      item.planItemId === planItem.id
      || (
        !item.planItemId
        && `${normalizeSingleLine(item.name).toLocaleLowerCase("cs-CZ")}|${normalizeSingleLine(item.dose).toLocaleLowerCase("cs-CZ")}` === planKey
      ),
  );
}

export async function checkMedicationReminders({
  treatmentPlan,
  recordedMedications,
  settings,
  todayKey,
  now = new Date(),
}) {
  if (
    !settings.enabled
    || getMedicationNotificationPermission() !== "granted"
    || !canUseMedicationNotifications()
  ) {
    return [];
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const firedReminders = loadFiredReminders();
  const shownReminderIds = [];
  const registration = await globalThis.navigator.serviceWorker.ready;

  for (const planItem of getTreatmentPlanForDate(treatmentPlan, todayKey)) {
    const reminderId = `${todayKey}|${planItem.id}|${planItem.time}`;
    const reminderAt = timeToMinutes(planItem.time) - settings.leadMinutes;
    const isDue = nowMinutes >= reminderAt && nowMinutes <= timeToMinutes(planItem.time) + 60;
    if (
      !isDue
      || firedReminders[reminderId]
      || wasPlanItemRecorded(planItem, recordedMedications)
    ) {
      continue;
    }

    await registration.showNotification(`Cas na lek: ${planItem.name}`, {
      body: `${planItem.dose} · planovano na ${planItem.time}`,
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      tag: `medication-${reminderId}`,
      data: {
        url: "/",
        planItemId: planItem.id,
      },
    });
    firedReminders[reminderId] = now.toISOString();
    shownReminderIds.push(reminderId);
  }

  saveFiredReminders(firedReminders);
  return shownReminderIds;
}
