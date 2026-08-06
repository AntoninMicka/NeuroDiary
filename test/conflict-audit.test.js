import test from "node:test";
import assert from "node:assert/strict";

import {
  clearConflictAudit,
  loadConflictAudit,
  recordConflictDetected,
  resolveConflictAudit,
} from "../src/services/conflictAudit.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("conflict audit stores only sync metadata and resolution outcome", () => {
  const storage = createStorage();
  const detected = recordConflictDetected({
    baseRevision: 3,
    remoteRevision: 4,
    detectedAt: "2026-08-06T12:00:00.000Z",
  }, storage);
  resolveConflictAudit(detected.id, {
    status: "resolved",
    resolvedRevision: 5,
    resolvedAt: "2026-08-06T12:00:01.000Z",
  }, storage);

  const [item] = loadConflictAudit(storage);
  assert.equal(item.status, "resolved");
  assert.equal(item.baseRevision, 3);
  assert.equal(item.remoteRevision, 4);
  assert.equal(item.resolvedRevision, 5);
  assert.equal("patientName" in item, false);
  assert.equal("entries" in item, false);

  clearConflictAudit(storage);
  assert.deepEqual(loadConflictAudit(storage), []);
});
