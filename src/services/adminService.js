import { getAuthorizationHeaderValue } from "./authService.js";
import { appUrl } from "./appUrl.js";

async function request(path, options = {}) {
  const authorization = getAuthorizationHeaderValue();
  if (!authorization) throw new Error("Pro administraci je nutné přihlášení.");
  const response = await fetch(appUrl(path), {
    ...options,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail ?? `Administrátorský požadavek selhal (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function fetchAdminStatus() {
  const payload = await request("/api/v1/admin/status");
  return {
    ...(payload.cloud ?? {}),
    administrator: payload.administrator,
    application: payload.application ?? {},
    schemaVersion: payload.application?.schemaVersion,
    gmail: payload.gmail ?? {},
    alerts: payload.alerts ?? {},
  };
}

export function createCloudBackup() {
  return request("/api/v1/admin/backups", { method: "POST" });
}

export function deleteCloudBackup(backupId) {
  return request(`/api/v1/admin/backups/${encodeURIComponent(backupId)}?confirm=true`, { method: "DELETE" });
}

export function fetchAdminUsers() {
  return request("/api/v1/admin/users");
}

export function updateAdminUserRoles(userId, roles) {
  return request(`/api/v1/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: "PATCH",
    body: JSON.stringify({ roles }),
  });
}

export function createLocalUser(user) {
  return request("/api/v1/admin/local-users", { method: "POST", body: JSON.stringify(user) });
}

export function deleteLocalUser(userId) {
  return request(`/api/v1/admin/local-users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}
