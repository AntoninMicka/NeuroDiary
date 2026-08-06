const CONFLICT_AUDIT_STORAGE_KEY = "neurodiary-conflict-audit-v1";
const DEVICE_ID_STORAGE_KEY = "neurodiary-device-id-v1";
const MAX_CONFLICT_AUDIT_ITEMS = 20;

function readJson(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getConflictDeviceId(storage = globalThis.localStorage) {
  const existing = storage?.getItem?.(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = createId();
  storage?.setItem?.(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export function loadConflictAudit(storage = globalThis.localStorage) {
  const items = readJson(storage, CONFLICT_AUDIT_STORAGE_KEY, []);
  return Array.isArray(items) ? items.slice(0, MAX_CONFLICT_AUDIT_ITEMS) : [];
}

export function recordConflictDetected(
  { baseRevision, remoteRevision, detectedAt = new Date().toISOString() },
  storage = globalThis.localStorage,
) {
  const item = {
    id: createId(),
    deviceId: getConflictDeviceId(storage),
    detectedAt,
    resolvedAt: "",
    baseRevision: Number(baseRevision ?? 0),
    remoteRevision: Number(remoteRevision ?? 0),
    resolvedRevision: null,
    strategy: "append-only-latest-wins",
    status: "detected",
  };
  const items = [item, ...loadConflictAudit(storage)].slice(0, MAX_CONFLICT_AUDIT_ITEMS);
  storage?.setItem?.(CONFLICT_AUDIT_STORAGE_KEY, JSON.stringify(items));
  return item;
}

export function resolveConflictAudit(
  conflictId,
  { status, resolvedRevision = null, resolvedAt = new Date().toISOString() },
  storage = globalThis.localStorage,
) {
  const items = loadConflictAudit(storage).map((item) => (
    item.id === conflictId
      ? {
          ...item,
          status: status === "resolved" ? "resolved" : "failed",
          resolvedRevision: resolvedRevision === null ? null : Number(resolvedRevision),
          resolvedAt,
        }
      : item
  ));
  storage?.setItem?.(CONFLICT_AUDIT_STORAGE_KEY, JSON.stringify(items));
  return items.find((item) => item.id === conflictId) ?? null;
}

export function clearConflictAudit(storage = globalThis.localStorage) {
  storage?.removeItem?.(CONFLICT_AUDIT_STORAGE_KEY);
}
