import { getTreatmentPlanForDate, shiftDateKey } from "../domain/diary.js";
import { getAuthorizationHeaderValue } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";

function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function buildHeaders(apiToken = "") {
  const headers = { "Content-Type": "application/json", "X-Device-ID": getCurrentDeviceId() };
  const authorization = getAuthorizationHeaderValue()
    || (apiToken.trim() ? `Bearer ${apiToken.trim()}` : "");
  if (authorization) {
    headers.Authorization = authorization;
  }
  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail ?? `Požadavek Web Push selhal s HTTP stavem ${response.status}.`);
  }
  return payload;
}

async function buildOpaqueReminderId(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function localDateTime(dateKey, time) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function canUseWebPush() {
  return Boolean(
    globalThis.isSecureContext
    && globalThis.navigator?.serviceWorker
    && "PushManager" in globalThis,
  );
}

export async function fetchWebPushConfig(endpoint = "") {
  const baseUrl = trimTrailingSlash(endpoint) || trimTrailingSlash(globalThis.location?.origin);
  if (!baseUrl) {
    return { enabled: false, publicKey: "" };
  }
  return fetchJson(`${baseUrl}/api/v1/push/config`);
}

export async function buildMedicationPushSchedule({
  treatmentPlan,
  leadMinutes,
  startDateKey,
  entries = {},
  days = 31,
  now = new Date(),
}) {
  const reminders = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = shiftDateKey(startDateKey, offset);
    for (const planItem of getTreatmentPlanForDate(treatmentPlan, dateKey)) {
      if ((entries[dateKey]?.medications ?? []).some((item) => item.planItemId === planItem.id)) {
        continue;
      }
      const scheduledAt = localDateTime(dateKey, planItem.time);
      scheduledAt.setMinutes(scheduledAt.getMinutes() - leadMinutes);
      if (scheduledAt <= now) {
        continue;
      }
      reminders.push({
        id: await buildOpaqueReminderId(`${dateKey}|${planItem.id}|${planItem.time}|${leadMinutes}`),
        scheduledAt: scheduledAt.toISOString(),
        type: "medication",
      });
    }
  }
  return reminders.slice(0, 250);
}

export async function registerWebPush({
  endpoint,
  apiToken,
  publicKey,
  treatmentPlan,
  leadMinutes,
  startDateKey,
  entries,
}) {
  if (!canUseWebPush() || Notification.permission !== "granted") {
    throw new Error("Web Push requires notification permission and a secure browser context.");
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const reminders = await buildMedicationPushSchedule({
    treatmentPlan,
    leadMinutes,
    startDateKey,
    entries,
  });
  const baseUrl = trimTrailingSlash(endpoint) || trimTrailingSlash(globalThis.location?.origin);
  const result = await fetchJson(`${baseUrl}/api/v1/push/registration`, {
    method: "PUT",
    headers: buildHeaders(apiToken),
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      reminders,
    }),
  });
  return { ...result, subscription };
}

export async function unregisterWebPush({ endpoint, apiToken }) {
  if (!canUseWebPush()) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  const baseUrl = trimTrailingSlash(endpoint) || trimTrailingSlash(globalThis.location?.origin);
  await fetchJson(`${baseUrl}/api/v1/push/registration`, {
    method: "DELETE",
    headers: buildHeaders(apiToken),
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
