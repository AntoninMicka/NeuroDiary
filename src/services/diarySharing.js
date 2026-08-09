import { decryptDiaryState, encryptDiaryState, importAccountMasterKey } from "./e2eCrypto.js";
import { decryptMasterKeyEnvelope, encryptMasterKeyForDevice } from "./deviceKeyExchange.js";
import { getAuthorizationHeaderValue, loadStoredAuthSession } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";
import { loadSyncKeyMaterial } from "./syncService.js";
import { deleteTreatmentDraft, listTreatmentDrafts, loadTreatmentDraft, saveTreatmentDraft } from "./treatmentDraftStore.js";

const draftScope = () => loadStoredAuthSession()?.user?.userId || "guest";

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

export async function createTreatmentProposal(settings, grant, treatmentPlan) {
  const exportedKey = await decryptMasterKeyEnvelope(grant.keyEnvelope);
  const masterKey = await importAccountMasterKey(exportedKey);
  const payload = await encryptDiaryState({ treatmentPlan }, masterKey, grant.keyVersion);
  return request(settings, "/api/v1/treatment-proposals", {
    method: "POST", body: JSON.stringify({ grantId: grant.grantId, baseRevision: grant.revision, payload }),
  });
}

export function fetchTreatmentProposals(settings) {
  return request(settings, "/api/v1/treatment-proposals");
}

export async function decryptTreatmentProposal(proposal, grant = null) {
  const exportedKey = grant
    ? await decryptMasterKeyEnvelope(grant.keyEnvelope)
    : loadSyncKeyMaterial().exportedMasterKey;
  if (!exportedKey) throw new Error("Na tomto zařízení chybí hlavní šifrovací klíč.");
  return decryptDiaryState(proposal.payload, await importAccountMasterKey(exportedKey));
}

export function decideTreatmentProposal(settings, proposalId, approve) {
  return request(settings, `/api/v1/treatment-proposals/${encodeURIComponent(proposalId)}/decision`, {
    method: "POST", body: JSON.stringify({ approve }),
  });
}

export function cancelTreatmentProposal(settings, proposalId) {
  return request(settings, `/api/v1/treatment-proposals/${encodeURIComponent(proposalId)}`, { method: "DELETE" });
}

export async function persistEncryptedTreatmentDraft(grant, treatmentPlan) {
  const exportedKey = await decryptMasterKeyEnvelope(grant.keyEnvelope);
  const masterKey = await importAccountMasterKey(exportedKey);
  const payload = await encryptDiaryState({ treatmentPlan }, masterKey, grant.keyVersion);
  return saveTreatmentDraft(draftScope(), {
    grantId: grant.grantId,
    ownerName: grant.state?.patientName || grant.ownerName || "",
    baseRevision: grant.revision,
    itemCount: treatmentPlan.length,
    payload,
  });
}

export async function restoreEncryptedTreatmentDraft(grant) {
  const draft = loadTreatmentDraft(draftScope(), grant.grantId);
  if (!draft) return null;
  const exportedKey = await decryptMasterKeyEnvelope(grant.keyEnvelope);
  const masterKey = await importAccountMasterKey(exportedKey);
  return { ...draft, ...(await decryptDiaryState(draft.payload, masterKey)) };
}

export function listEncryptedTreatmentDrafts() {
  return listTreatmentDrafts(draftScope()).map(({ payload: _payload, ...metadata }) => metadata);
}

export function removeEncryptedTreatmentDraft(grantId) {
  return deleteTreatmentDraft(draftScope(), grantId);
}
