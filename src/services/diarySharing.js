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

export function fetchDiaryShares(settings, includeIncoming = false) {
  return request(settings, `/api/v1/shares?includeIncoming=${includeIncoming ? "true" : "false"}`);
}

export async function createDiaryShare(settings, recipientEmail) {
  return request(settings, "/api/v1/share-invitations", {
    method: "POST",
    body: JSON.stringify({ recipientEmail: recipientEmail.trim() }),
  });
}

export function respondToDiaryShareInvitation(settings, invitationId, accept) {
  return request(settings, `/api/v1/share-invitations/${encodeURIComponent(invitationId)}/respond`, {
    method: "POST", body: JSON.stringify({ accept }),
  });
}

export async function activateDiaryShareInvitation(settings, invitationId) {
  const material = loadSyncKeyMaterial();
  if (!material.exportedMasterKey) throw new Error("Nejprve inicializujte šifrovanou cloudovou synchronizaci.");
  const target = await request(settings, `/api/v1/share-invitations/${encodeURIComponent(invitationId)}/recipient-key`);
  const keyEnvelope = await encryptMasterKeyForDevice(material.exportedMasterKey, target);
  return request(settings, `/api/v1/share-invitations/${encodeURIComponent(invitationId)}/activate`, {
    method: "POST", body: JSON.stringify({ keyVersion: material.keyVersion, keyEnvelope }),
  });
}

export function cancelDiaryShareInvitation(settings, invitationId) {
  return request(settings, `/api/v1/share-invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
}

export function revokeDiaryShare(settings, grantId) {
  return request(settings, `/api/v1/shares/${encodeURIComponent(grantId)}`, { method: "DELETE" });
}

export async function decryptSharedDiary(grant) {
  const exportedKey = await decryptMasterKeyEnvelope(grant.keyEnvelope);
  const masterKey = await importAccountMasterKey(exportedKey);
  return decryptDiaryState(grant.payload, masterKey);
}
