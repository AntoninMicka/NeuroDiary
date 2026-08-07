import { prepareStateForSync } from "../domain/diary.js";
import { decryptDiaryState, encryptDiaryState, exportAccountMasterKey, generateAccountMasterKey, generateRecoverySecret, importAccountMasterKey, unwrapAccountMasterKey, wrapAccountMasterKey } from "./e2eCrypto.js";
import { getAuthorizationHeaderValue } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";
import { publishKeyTransfersToOtherDevices } from "./deviceKeyExchange.js";

const SYNC_SETTINGS_STORAGE_KEY = "neurodiary-sync-settings-v1";
const SYNC_KEY_MATERIAL_STORAGE_KEY = "neurodiary-sync-key-material-v1";

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeSyncMessage(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (value && typeof value === "object") {
    if (typeof value.detail === "string" && value.detail.trim()) {
      return value.detail;
    }
    if (typeof value.message === "string" && value.message.trim()) {
      return value.message;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

export function deriveSyncEndpoint() {
  const origin = globalThis.location?.origin ?? "";
  return trimTrailingSlash(origin);
}

function buildHeaders(settings) {
  const headers = {
    "Content-Type": "application/json",
    "X-Device-ID": getCurrentDeviceId(),
  };

  const authHeader = getAuthorizationHeaderValue();
  if (authHeader) {
    headers.Authorization = authHeader;
  } else if (settings.apiToken?.trim()) {
    headers.Authorization = `Bearer ${settings.apiToken.trim()}`;
  }

  return headers;
}

function buildEndpoint(settings, path) {
  const baseUrl = trimTrailingSlash(settings.endpoint ?? "") || deriveSyncEndpoint();
  if (!baseUrl) {
    throw new Error("Sync endpoint is not configured.");
  }

  return `${baseUrl}${path}`;
}

export function createDefaultSyncSettings() {
  return {
    endpoint: "",
    apiToken: "",
    userId: "",
    revision: 0,
    lastSyncAt: "",
    lastSyncStatus: "idle",
    lastSyncMessage: "",
  };
}

export function loadSyncSettings() {
  try {
    const raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return createDefaultSyncSettings();
    }

    const nextSettings = {
      ...createDefaultSyncSettings(),
      ...JSON.parse(raw),
    };
    nextSettings.lastSyncMessage = normalizeSyncMessage(nextSettings.lastSyncMessage);
    return nextSettings;
  } catch {
    return createDefaultSyncSettings();
  }
}

export function getEffectiveSyncEndpoint(settings = {}) {
  return trimTrailingSlash(settings.endpoint ?? "") || deriveSyncEndpoint();
}

export function saveSyncSettings(settings) {
  const nextSettings = {
    ...createDefaultSyncSettings(),
    ...cloneSerializable(settings),
  };
  nextSettings.lastSyncMessage = normalizeSyncMessage(nextSettings.lastSyncMessage);
  localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function loadSyncKeyMaterial() {
  try {
    const raw = localStorage.getItem(SYNC_KEY_MATERIAL_STORAGE_KEY);
    if (!raw) {
      return {
        keyVersion: 1,
        exportedMasterKey: "",
        recoverySecret: "",
      };
    }

    return {
      keyVersion: 1,
      exportedMasterKey: "",
      recoverySecret: "",
      ...JSON.parse(raw),
    };
  } catch {
    return {
      keyVersion: 1,
      exportedMasterKey: "",
      recoverySecret: "",
    };
  }
}

export function saveSyncKeyMaterial(keyMaterial) {
  const nextKeyMaterial = {
    userId: "",
    keyVersion: 1,
    exportedMasterKey: "",
    recoverySecret: "",
    ...cloneSerializable(keyMaterial),
  };
  localStorage.setItem(SYNC_KEY_MATERIAL_STORAGE_KEY, JSON.stringify(nextKeyMaterial));
  return nextKeyMaterial;
}

export function hasStoredSyncMasterKey() {
  return Boolean(loadSyncKeyMaterial().exportedMasterKey);
}

export function hasStoredRecoverySecret() {
  return Boolean(loadSyncKeyMaterial().recoverySecret);
}

export function saveRecoverySecret(recoverySecret) {
  const current = loadSyncKeyMaterial();
  return saveSyncKeyMaterial({
    ...current,
    recoverySecret: recoverySecret.trim(),
  });
}

export function clearSyncKeyMaterial() {
  return saveSyncKeyMaterial({
    userId: "",
    keyVersion: 1,
    exportedMasterKey: "",
    recoverySecret: "",
  });
}

export async function acceptTransferredSyncKey(transfer) {
  if (!transfer?.exportedMasterKey) return false;
  await importAccountMasterKey(transfer.exportedMasterKey);
  const current = loadSyncKeyMaterial();
  if (Number(transfer.keyVersion) < Number(current.keyVersion ?? 1)) throw new Error("Server nabidl zastaralou verzi klice.");
  saveSyncKeyMaterial({ ...current, keyVersion: Number(transfer.keyVersion), exportedMasterKey: transfer.exportedMasterKey });
  return true;
}

export function clearSyncState(settings = {}) {
  return saveSyncSettings({
    endpoint: settings.endpoint ?? "",
    apiToken: settings.apiToken ?? "",
    userId: "",
    revision: 0,
    lastSyncAt: "",
    lastSyncStatus: "idle",
    lastSyncMessage: "",
  });
}

async function resolveMasterKeyForSync(wrappedKey = null) {
  const keyMaterial = loadSyncKeyMaterial();

  if (keyMaterial.exportedMasterKey) {
    return importAccountMasterKey(keyMaterial.exportedMasterKey);
  }

  if (wrappedKey && keyMaterial.recoverySecret) {
    const masterKey = await unwrapAccountMasterKey(wrappedKey, keyMaterial.recoverySecret);
    const exportedMasterKey = await exportAccountMasterKey(masterKey);
    saveSyncKeyMaterial({
      ...keyMaterial,
      keyVersion: Number(wrappedKey.keyVersion ?? keyMaterial.keyVersion ?? 1),
      exportedMasterKey,
    });
    return masterKey;
  }

  throw new Error("Missing local encryption key. Restore it using your recovery secret.");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      normalizeSyncMessage(payload?.detail ?? payload ?? `Sync request failed with HTTP ${response.status}.`),
    );
  }

  return payload;
}

export async function initializeCloudSync({ state, settings, recoverySecret = "" }) {
  const normalizedSettings = saveSyncSettings(settings);
  const currentKeyMaterial = loadSyncKeyMaterial();
  const nextRecoverySecret = recoverySecret.trim() || currentKeyMaterial.recoverySecret || generateRecoverySecret();
  const masterKey = currentKeyMaterial.exportedMasterKey
    ? await importAccountMasterKey(currentKeyMaterial.exportedMasterKey)
    : await generateAccountMasterKey();
  const exportedMasterKey = await exportAccountMasterKey(masterKey);
  const keyVersion = Number(currentKeyMaterial.keyVersion ?? 1);
  const wrappedKey = await wrapAccountMasterKey(masterKey, nextRecoverySecret, keyVersion);
  const payload = await encryptDiaryState(prepareStateForSync(state), masterKey, keyVersion);

  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/push"), {
    method: "POST",
    headers: buildHeaders(normalizedSettings),
    body: JSON.stringify({
      baseRevision: 0,
      payload,
      wrappedKey,
      force: false,
    }),
  });

  if (result.status === "conflict") {
    throw new Error("Cloud sync uz obsahuje data. Nejprve provedte Pull ze serveru.");
  }

  saveSyncKeyMaterial({
    userId: normalizedSettings.userId ?? "",
    keyVersion,
    exportedMasterKey,
    recoverySecret: nextRecoverySecret,
  });

  return {
    generatedRecoverySecret: currentKeyMaterial.recoverySecret ? "" : nextRecoverySecret,
    revision: result.revision,
    updatedAt: result.updatedAt,
    wrappedKey: result.wrappedKey,
  };
}

export async function pullCloudState(settings) {
  const normalizedSettings = saveSyncSettings(settings);
  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/pull"), {
    method: "GET",
    headers: buildHeaders(normalizedSettings),
  });

  if (!result.payload) {
    return {
      revision: 0,
      updatedAt: "",
      state: null,
      wrappedKey: null,
    };
  }

  const masterKey = await resolveMasterKeyForSync(result.wrappedKey);
  const state = await decryptDiaryState(result.payload, masterKey);

  return {
    revision: result.revision,
    updatedAt: result.updatedAt,
    state,
    wrappedKey: result.wrappedKey,
  };
}

export async function recoverLocalSyncKey(settings) {
  const normalizedSettings = saveSyncSettings(settings);
  const keyMaterial = loadSyncKeyMaterial();

  if (keyMaterial.exportedMasterKey) {
    return {
      recovered: false,
      reason: "already-present",
    };
  }

  if (!keyMaterial.recoverySecret) {
    return {
      recovered: false,
      reason: "missing-recovery-secret",
    };
  }

  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/pull"), {
    method: "GET",
    headers: buildHeaders(normalizedSettings),
  });

  if (!result.payload || !result.wrappedKey) {
    return {
      recovered: false,
      reason: "missing-remote-key",
      revision: result.revision ?? 0,
      updatedAt: result.updatedAt ?? "",
    };
  }

  await resolveMasterKeyForSync(result.wrappedKey);

  return {
    recovered: true,
    reason: "recovered",
    revision: result.revision ?? 0,
    updatedAt: result.updatedAt ?? "",
  };
}

export async function pushCloudState({ state, settings, baseRevision, force = false }) {
  const normalizedSettings = saveSyncSettings(settings);
  const keyMaterial = loadSyncKeyMaterial();
  const masterKey = await resolveMasterKeyForSync();
  const keyVersion = Number(keyMaterial.keyVersion ?? 1);
  const payload = await encryptDiaryState(prepareStateForSync(state), masterKey, keyVersion);
  const wrappedKey = keyMaterial.recoverySecret
    ? await wrapAccountMasterKey(masterKey, keyMaterial.recoverySecret, keyVersion)
    : null;

  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/push"), {
    method: "POST",
    headers: buildHeaders(normalizedSettings),
    body: JSON.stringify({
      baseRevision,
      payload,
      wrappedKey,
      force,
    }),
  });

  let remoteState = null;
  if (result.payload) {
    const resolvedMasterKey = await resolveMasterKeyForSync(result.wrappedKey);
    remoteState = await decryptDiaryState(result.payload, resolvedMasterKey);
  }

  return {
    status: result.status,
    revision: result.revision,
    updatedAt: result.updatedAt,
    remoteState,
    wrappedKey: result.wrappedKey,
  };
}

export async function resetCloudState(settings) {
  const normalizedSettings = saveSyncSettings(settings);
  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/reset"), {
    method: "DELETE",
    headers: buildHeaders(normalizedSettings),
  });

  return {
    deleted: Boolean(result.deleted),
    updatedAt: result.updatedAt ?? "",
  };
}

export async function rotateCloudEncryption({ state, settings, baseRevision }) {
  const normalizedSettings = saveSyncSettings(settings);
  const currentKeyMaterial = loadSyncKeyMaterial();
  const keyVersion = Math.max(1, Number(currentKeyMaterial.keyVersion ?? 1)) + 1;
  const recoverySecret = generateRecoverySecret();
  const masterKey = await generateAccountMasterKey();
  const exportedMasterKey = await exportAccountMasterKey(masterKey);
  const wrappedKey = await wrapAccountMasterKey(masterKey, recoverySecret, keyVersion);
  const payload = await encryptDiaryState(prepareStateForSync(state), masterKey, keyVersion);
  const result = await fetchJson(buildEndpoint(normalizedSettings, "/api/v1/sync/push"), {
    method: "POST",
    headers: buildHeaders(normalizedSettings),
    body: JSON.stringify({ baseRevision, payload, wrappedKey, force: true }),
  });
  saveSyncKeyMaterial({
    userId: normalizedSettings.userId ?? "",
    keyVersion,
    exportedMasterKey,
    recoverySecret,
  });
  const transfers = await publishKeyTransfersToOtherDevices(normalizedSettings, exportedMasterKey, keyVersion);
  return { recoverySecret, keyVersion, revision: result.revision, updatedAt: result.updatedAt, transferredDeviceCount: transfers.length };
}
