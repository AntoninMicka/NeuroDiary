import { decryptDiaryState, importAccountMasterKey } from "./e2eCrypto.js";
import { decryptMasterKeyEnvelope, encryptMasterKeyForDevice } from "./deviceKeyExchange.js";
import { getAuthorizationHeaderValue } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";
import { loadSyncKeyMaterial } from "./syncService.js";

function endpoint(settings, path) {
  const base = (settings.endpoint || globalThis.location?.origin || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

function headers(settings) {
  const authorization = getAuthorizationHeaderValue() || (settings.apiToken?.trim() ? `Bearer ${settings.apiToken.trim()}` : "");
  return { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}), "X-Device-ID": getCurrentDeviceId() };
}

async function request(settings, path, options = {}) {
  const response = await fetch(endpoint(settings, path), { ...options, headers: headers(settings) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Sdílení selhalo (${response.status}).`);
  return payload;
}

export function fetchDiaryShares(settings) {
  return request(settings, "/api/v1/shares");
}

export async function createDiaryShare(settings, recipientEmail) {
  const material = loadSyncKeyMaterial();
  if (!material.exportedMasterKey) throw new Error("Nejprve inicializujte šifrovanou cloudovou synchronizaci.");
  const target = await request(settings, `/api/v1/shares/recipient-key?email=${encodeURIComponent(recipientEmail.trim())}`);
  const keyEnvelope = await encryptMasterKeyForDevice(material.exportedMasterKey, target);
  return request(settings, "/api/v1/shares", {
    method: "POST",
    body: JSON.stringify({ recipientEmail: recipientEmail.trim(), recipientDeviceId: target.deviceId, keyVersion: material.keyVersion, keyEnvelope }),
  });
}

export function revokeDiaryShare(settings, grantId) {
  return request(settings, `/api/v1/shares/${encodeURIComponent(grantId)}`, { method: "DELETE" });
}

export async function decryptSharedDiary(grant) {
  const exportedKey = await decryptMasterKeyEnvelope(grant.keyEnvelope);
  const masterKey = await importAccountMasterKey(exportedKey);
  return decryptDiaryState(grant.payload, masterKey);
}
