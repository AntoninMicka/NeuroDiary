import { getAuthorizationHeaderValue } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";

async function request(path, options = {}) {
  const authorization = getAuthorizationHeaderValue();
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: authorization, "X-Device-ID": getCurrentDeviceId() },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Načtení rolí selhalo (${response.status}).`);
  return payload;
}

export function fetchCurrentRoles() {
  return request("/api/v1/roles");
}

export function updateCurrentDeviceRoles(roles) {
  return request("/api/v1/roles/active", { method: "PUT", body: JSON.stringify({ roles }) });
}
