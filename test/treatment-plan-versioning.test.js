import test from "node:test";
import assert from "node:assert/strict";

import {
  createTreatmentPlanItem,
  getTreatmentPlanForDate,
  mergeDiaryStatesAppendOnly,
  normalizeState,
} from "../src/domain/diary.js";
import { analyzeMedicationAdherence } from "../src/services/adherence.js";
import { analyzeLongTermTrends } from "../src/services/statistics.js";

const oldDose = createTreatmentPlanItem({
  id: "old",
  name: "Levodopa",
  dose: "100 mg",
  time: "08:00",
  validFrom: "2026-01-01",
  validTo: "2026-01-31",
});
const newDose = createTreatmentPlanItem({
  id: "new",
  name: "Levodopa",
  dose: "150 mg",
  time: "08:00",
  validFrom: "2026-02-01",
});

test("selects only plan versions active on the requested date", () => {
  const plan = [oldDose, newDose];
  assert.deepEqual(getTreatmentPlanForDate(plan, "2026-01-15").map((item) => item.id), ["old"]);
  assert.deepEqual(getTreatmentPlanForDate(plan, "2026-02-15").map((item) => item.id), ["new"]);
});

test("keeps legacy plan items without validity dates active", () => {
  const state = normalizeState({
    selectedDate: "2026-02-15",
    treatmentPlan: [{ id: "legacy", name: "Lék", dose: "1", time: "09:00" }],
    entries: {},
  });
  assert.equal(state.treatmentPlan[0].validFrom, "");
  assert.equal(state.treatmentPlan[0].validTo, "");
  assert.equal(getTreatmentPlanForDate(state.treatmentPlan, "2020-01-01").length, 1);
});

test("daily adherence uses the historical plan version", () => {
  const result = analyzeMedicationAdherence({
    treatmentPlan: [oldDose, newDose],
    recordedMedications: [{ id: "taken", name: "Levodopa", dose: "100 mg", time: "08:05", planItemId: "old" }],
    selectedDate: "2026-01-15",
    todayDate: "2026-03-01",
  });
  assert.equal(result.summary.plannedCount, 1);
  assert.equal(result.summary.takenCount, 1);
  assert.equal(result.plannedDoses[0].planItem.id, "old");
});

test("long-term adherence switches plans at their validity boundary", () => {
  const entries = {
    "2026-01-31": {
      hours: {},
      medications: [{ id: "a", name: "Levodopa", dose: "100 mg", time: "08:00", planItemId: "old" }],
    },
    "2026-02-01": {
      hours: {},
      medications: [{ id: "b", name: "Levodopa", dose: "150 mg", time: "08:00", planItemId: "new" }],
    },
  };
  const result = analyzeLongTermTrends(entries, [oldDose, newDose], "2026-02-01", 2);
  assert.equal(result.buckets[0].adherencePercent, 100);
});

test("sync merge keeps versions created on both devices and preserves an end date", () => {
  const base = normalizeState({
    selectedDate: "2026-02-01",
    treatmentPlan: [oldDose],
    entries: {},
  });
  const incoming = normalizeState({
    selectedDate: "2026-02-01",
    treatmentPlan: [{ ...oldDose, validTo: "" }, newDose],
    entries: {},
  });
  const merged = mergeDiaryStatesAppendOnly(base, incoming);
  assert.deepEqual(merged.treatmentPlan.map((item) => item.id).sort(), ["new", "old"]);
  assert.equal(merged.treatmentPlan.find((item) => item.id === "old").validTo, "2026-01-31");
});
