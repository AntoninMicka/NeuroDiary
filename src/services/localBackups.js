import { parseJsonBackup, serializeJsonBackup } from "./jsonTransfer.js";

const DATABASE_NAME = "neurodiary-local-backups";
const STORE_NAME = "backups";
export const MAX_LOCAL_BACKUPS = 7;
export const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB neni v tomto prohlizeci dostupne."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Databazi zaloh se nepodarilo otevrit."));
  });
}

async function withStore(mode, operation, indexedDb) {
  const database = await openDatabase(indexedDb);
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    return await operation(transaction.objectStore(STORE_NAME));
  } finally {
    database.close();
  }
}

export async function listLocalBackups(indexedDb = globalThis.indexedDB) {
  const items = await withStore("readonly", (store) => requestResult(store.getAll()), indexedDb);
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function shouldCreateAutomaticBackup(backups, now = new Date()) {
  const latestAutomatic = backups.find((item) => item.reason === "automatic");
  return !latestAutomatic
    || now.getTime() - Date.parse(latestAutomatic.createdAt) >= AUTOMATIC_BACKUP_INTERVAL_MS;
}

export async function createLocalBackup(state, { reason = "manual", now = new Date(), indexedDb } = {}) {
  const item = {
    id: globalThis.crypto?.randomUUID?.() ?? `backup-${now.getTime()}`,
    createdAt: now.toISOString(),
    reason,
    payload: serializeJsonBackup(state),
  };
  await withStore("readwrite", (store) => requestResult(store.put(item)), indexedDb);
  const items = await listLocalBackups(indexedDb);
  for (const staleItem of items.slice(MAX_LOCAL_BACKUPS)) {
    await withStore("readwrite", (store) => requestResult(store.delete(staleItem.id)), indexedDb);
  }
  return item;
}

export async function restoreLocalBackup(backupId, indexedDb = globalThis.indexedDB) {
  const item = await withStore("readonly", (store) => requestResult(store.get(backupId)), indexedDb);
  if (!item?.payload) {
    throw new Error("Vybrana zaloha nebyla nalezena.");
  }
  return parseJsonBackup(item.payload);
}

export async function deleteLocalBackup(backupId, indexedDb = globalThis.indexedDB) {
  await withStore("readwrite", (store) => requestResult(store.delete(backupId)), indexedDb);
}
