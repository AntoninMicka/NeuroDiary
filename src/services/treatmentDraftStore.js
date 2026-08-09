const STORAGE_KEY = "neurodiary-treatment-proposal-drafts-v1";
const storageKey = (scope) => `${STORAGE_KEY}:${encodeURIComponent(scope || "guest")}`;

function loadRecords(scope) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(storageKey(scope)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveRecords(scope, records) {
  globalThis.localStorage?.setItem(storageKey(scope), JSON.stringify(records));
}

export function saveTreatmentDraft(scope, record) {
  const records = loadRecords(scope);
  records[record.grantId] = {
    grantId: record.grantId,
    ownerName: record.ownerName || "",
    baseRevision: Number(record.baseRevision ?? 0),
    itemCount: Number(record.itemCount ?? 0),
    updatedAt: record.updatedAt || new Date().toISOString(),
    payload: record.payload,
  };
  saveRecords(scope, records);
  return records[record.grantId];
}

export function loadTreatmentDraft(scope, grantId) {
  return loadRecords(scope)[grantId] ?? null;
}

export function listTreatmentDrafts(scope) {
  return Object.values(loadRecords(scope)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function deleteTreatmentDraft(scope, grantId) {
  const records = loadRecords(scope);
  if (!records[grantId]) return false;
  delete records[grantId];
  saveRecords(scope, records);
  return true;
}
