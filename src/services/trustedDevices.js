import { getAuthorizationHeaderValue } from "./authService.js";
import { getAppOrigin } from "./appUrl.js";

const DEVICE_ID_KEY = "neurodiary-device-id-v1";

export function getCurrentDeviceId() {
  let deviceId = globalThis.localStorage?.getItem(DEVICE_ID_KEY) ?? "";
  if (!deviceId) {
    deviceId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll(".", "-");
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function regenerateCurrentDeviceId() {
  const deviceId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll(".", "-");
  globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function getDefaultDeviceName() {
  const platform = globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || "Zarizeni";
  const browser = /Firefox/i.test(globalThis.navigator?.userAgent ?? "")
    ? "Firefox"
    : /Edg/i.test(globalThis.navigator?.userAgent ?? "") ? "Edge"
      : /Chrome/i.test(globalThis.navigator?.userAgent ?? "") ? "Chrome" : "Prohlizec";
  return `${platform} · ${browser}`.slice(0, 80);
}

function endpoint(settings, path) {
  const base = (settings.endpoint || getAppOrigin()).replace(/\/+$/, "");
  return `${base}${path}`;
}

function headers(settings) {
  const authorization = getAuthorizationHeaderValue()
    || (settings.apiToken?.trim() ? `Bearer ${settings.apiToken.trim()}` : "");
  return {
    "Content-Type": "application/json",
    ...(authorization ? { Authorization: authorization } : {}),
    "X-Device-ID": getCurrentDeviceId(),
  };
}

async function request(settings, path, options = {}) {
  const response = await fetch(endpoint(settings, path), { ...options, headers: headers(settings) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Požadavek zařízení selhal (${response.status}).`);
  return payload;
}

export function registerCurrentDevice(settings, name = getDefaultDeviceName()) {
  return request(settings, "/api/v1/devices/current", {
    method: "PUT",
    body: JSON.stringify({ deviceId: getCurrentDeviceId(), name }),
  });
}

function isDeviceRecord(value) {
  return Boolean(value && typeof value === "object" && typeof value.deviceId === "string");
}

export async function ensureCurrentDeviceRegistration(settings, name = getDefaultDeviceName()) {
  const registration = await registerCurrentDevice(settings, name);
  if (isDeviceRecord(registration)) {
    return registration;
  }

  // Older or partially upgraded backends could persist the registration but return an empty body.
  const currentDeviceId = getCurrentDeviceId();
  const registeredDevice = (await fetchTrustedDevices(settings)).find(
    (device) => device.current || device.deviceId === currentDeviceId,
  );
  if (registeredDevice) {
    return registeredDevice;
  }

  throw new Error("Server potvrdil registraci, ale nevrátil údaje aktuálního zařízení.");
}

export async function fetchTrustedDevices(settings) {
  const payload = await request(settings, "/api/v1/devices");
  return (Array.isArray(payload?.devices) ? payload.devices : []).filter(isDeviceRecord);
}

export function revokeTrustedDevice(settings, deviceId) {
  return request(settings, `/api/v1/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
}

export function renameTrustedDevice(settings, deviceId, name) {
  return request(settings, `/api/v1/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function revokeOtherTrustedDevices(settings) {
  return request(settings, "/api/v1/devices/revoke-others", { method: "POST" });
}
