import { decryptDiaryState, encryptDiaryState, exportAccountMasterKey, generateAccountMasterKey, generateRecoverySecret, importAccountMasterKey, unwrapAccountMasterKey, wrapAccountMasterKey } from "./e2eCrypto.js";
import { getAuthorizationHeaderValue } from "./authService.js";

const SYNC_SETTINGS_STORAGE_KEY = "neurodiary-sync-settings-v1";
const SYNC_KEY_MATERIAL_STORAGE_KEY = "neurodiary-sync-key-material-v1";

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

export function deriveSyncEndpoint() {
  const origin = globalThis.location?.origin ?? "";
  return trimTrailingSlash(origin);
}

function buildHeaders(settings) {
  const headers = {
    "Content-Type": "application/json",
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

    return {
      ...createDefaultSyncSettings(),
      ...JSON.parse(raw),
    };
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
  localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function loadSyncKeyMaterial() {
  try {
    const raw = localStorage.getItem(SYNC_KEY_MATERIAL_STORAGE_KEY);
    if (!raw) {
      return {
        exportedMasterKey: "",
        recoverySecret: "",
      };
    }

    return {
      exportedMasterKey: "",
      recoverySecret: "",
      ...JSON.parse(raw),
    };
  } catch {
    return {
      exportedMasterKey: "",
      recoverySecret: "",
    };
  }
}

export function saveSyncKeyMaterial(keyMaterial) {
  const nextKeyMaterial = {
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
    throw new Error(payload?.detail ?? `Sync request failed with HTTP ${response.status}.`);
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
  const wrappedKey = await wrapAccountMasterKey(masterKey, nextRecoverySecret);
  const payload = await encryptDiaryState(state, masterKey);

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

export async function pushCloudState({ state, settings, baseRevision, force = false }) {
  const normalizedSettings = saveSyncSettings(settings);
  const keyMaterial = loadSyncKeyMaterial();
  const masterKey = await resolveMasterKeyForSync();
  const payload = await encryptDiaryState(state, masterKey);
  const wrappedKey = keyMaterial.recoverySecret
    ? await wrapAccountMasterKey(masterKey, keyMaterial.recoverySecret)
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
