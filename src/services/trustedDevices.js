import { getAuthorizationHeaderValue } from "./authService.js";

const DEVICE_ID_KEY = "neurodiary-device-id-v1";

export function getCurrentDeviceId() {
  let deviceId = globalThis.localStorage?.getItem(DEVICE_ID_KEY) ?? "";
  if (!deviceId) {
    deviceId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll(".", "-");
    globalThis.localStorage?.setItem(DEVICE_ID_KEY, deviceId);
  }
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
  const base = (settings.endpoint || globalThis.location?.origin || "").replace(/\/+$/, "");
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
  if (!response.ok) throw new Error(payload?.detail || `Device request failed (${response.status}).`);
  return payload;
}

export function registerCurrentDevice(settings, name = getDefaultDeviceName()) {
  return request(settings, "/api/v1/devices/current", {
    method: "PUT",
    body: JSON.stringify({ deviceId: getCurrentDeviceId(), name }),
  });
}

export async function fetchTrustedDevices(settings) {
  return (await request(settings, "/api/v1/devices")).devices ?? [];
}

export function revokeTrustedDevice(settings, deviceId) {
  return request(settings, `/api/v1/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
}

export function revokeOtherTrustedDevices(settings) {
  return request(settings, "/api/v1/devices/revoke-others", { method: "POST" });
}
