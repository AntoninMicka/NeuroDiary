import { evaluateDayQuality } from "./dataQuality.js";

const SETTINGS_KEY = "neurodiary-diary-reminders-v1";
const FIRED_KEY = "neurodiary-diary-reminders-fired-v1";

export function createDefaultDiaryReminderSettings() {
  return { enabled: false, time: "20:00" };
}

export function loadDiaryReminderSettings() {
  try {
    return {
      ...createDefaultDiaryReminderSettings(),
      ...JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? "{}"),
    };
  } catch {
    return createDefaultDiaryReminderSettings();
  }
}

export function saveDiaryReminderSettings(settings) {
  const value = {
    enabled: settings.enabled === true,
    time: /^\d{2}:\d{2}$/.test(settings.time) ? settings.time : "20:00",
  };
  globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(value));
  return value;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function shouldRemindToCompleteDiary({ entry, dateKey, settings, now = new Date() }) {
  if (!settings.enabled || timeToMinutes(now.toTimeString().slice(0, 5)) < timeToMinutes(settings.time)) {
    return false;
  }
  const quality = evaluateDayQuality(entry, dateKey, { todayDate: dateKey, now });
  return quality.missingHourLabels.length > 0 || !quality.hasSleepQuality || !quality.hasOverallStatus;
}

export async function checkDiaryCompletionReminder({ entry, dateKey, settings, now = new Date() }) {
  if (!shouldRemindToCompleteDiary({ entry, dateKey, settings, now })) {
    return false;
  }
  if (globalThis.Notification?.permission !== "granted" || !globalThis.navigator?.serviceWorker) {
    return false;
  }
  if (globalThis.localStorage?.getItem(FIRED_KEY) === dateKey) {
    return false;
  }
  const quality = evaluateDayQuality(entry, dateKey, { todayDate: dateKey, now });
  const registration = await globalThis.navigator.serviceWorker.ready;
  await registration.showNotification("Doplnte dnesni denik", {
    body: quality.missingHourLabels.length
      ? `Chybi ${quality.missingHourLabels.length} hodinovych zaznamu.`
      : "Chybi denni hodnoceni.",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: `diary-completion-${dateKey}`,
    data: { url: "/" },
  });
  globalThis.localStorage?.setItem(FIRED_KEY, dateKey);
  return true;
}
