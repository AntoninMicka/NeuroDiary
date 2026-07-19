import { normalizeState } from "../domain/diary.js";
import { auditDiaryState } from "./dataIntegrity.js";

export const JSON_BACKUP_FORMAT = "neurodiary-backup";
export const JSON_BACKUP_VERSION = 1;

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildJsonBackupPayload(state) {
  return {
    format: JSON_BACKUP_FORMAT,
    version: JSON_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: normalizeState(cloneSerializable(state)),
  };
}

export function serializeJsonBackup(state) {
  return JSON.stringify(buildJsonBackupPayload(state), null, 2);
}

export function parseJsonBackup(raw) {
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid NeuroDiary JSON backup.");
  }

  if (parsed.format !== JSON_BACKUP_FORMAT) {
    throw new Error("Unsupported JSON backup format.");
  }

  if (typeof parsed.version !== "number" || parsed.version > JSON_BACKUP_VERSION) {
    throw new Error("Unsupported JSON backup version.");
  }

  if (!parsed.state || typeof parsed.state !== "object") {
    throw new Error("JSON backup does not contain application state.");
  }

  const normalizedState = normalizeState(cloneSerializable(parsed.state));
  const integrityReport = auditDiaryState(normalizedState);

  if (integrityReport.summary.issueCount > 0) {
    throw new Error("JSON backup failed integrity validation.");
  }

  return normalizedState;
}
