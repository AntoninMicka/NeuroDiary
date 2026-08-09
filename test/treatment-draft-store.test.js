import test from "node:test";
import assert from "node:assert/strict";
import { deleteTreatmentDraft, listTreatmentDrafts, loadTreatmentDraft, saveTreatmentDraft } from "../src/services/treatmentDraftStore.js";

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("stores separate encrypted treatment drafts per grant", () => {
  installStorage();
  saveTreatmentDraft("doctor-a", { grantId: "grant-a", ownerName: "A", baseRevision: 2, itemCount: 3, updatedAt: "2026-01-01T10:00:00Z", payload: { cipherText: "encrypted-a" } });
  saveTreatmentDraft("doctor-a", { grantId: "grant-b", ownerName: "B", baseRevision: 4, itemCount: 1, updatedAt: "2026-01-02T10:00:00Z", payload: { cipherText: "encrypted-b" } });
  assert.equal(loadTreatmentDraft("doctor-a", "grant-a").payload.cipherText, "encrypted-a");
  assert.deepEqual(listTreatmentDrafts("doctor-a").map((item) => item.grantId), ["grant-b", "grant-a"]);
  assert.deepEqual(listTreatmentDrafts("doctor-b"), []);
  assert.equal(deleteTreatmentDraft("doctor-a", "grant-a"), true);
  assert.equal(loadTreatmentDraft("doctor-a", "grant-a"), null);
});
