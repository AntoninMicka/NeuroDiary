import test from "node:test";
import assert from "node:assert/strict";
import { compareTreatmentPlans } from "../src/services/treatmentProposal.js";

test("compares a batch treatment proposal by stable item ids", () => {
  const current = [
    { id: "a", name: "A", dose: "1", time: "08:00" },
    { id: "b", name: "B", dose: "2", time: "12:00" },
  ];
  const proposed = [
    { id: "a", name: "A", dose: "1.5", time: "09:00" },
    { id: "c", name: "C", dose: "3", time: "18:00" },
  ];
  const result = compareTreatmentPlans(current, proposed);
  assert.equal(result.total, 3);
  assert.deepEqual(result.added.map((item) => item.id), ["c"]);
  assert.deepEqual(result.removed.map((item) => item.id), ["b"]);
  assert.deepEqual(result.changed[0].changes.map((item) => item.field), ["dose", "time"]);
});
