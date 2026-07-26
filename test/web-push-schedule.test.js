import test from "node:test";
import assert from "node:assert/strict";

import { buildMedicationPushSchedule } from "../src/services/webPushService.js";

const plan = [{
  id: "morning-dose",
  name: "Sensitive medication name",
  dose: "100 mg",
  time: "08:00",
  validFrom: "2026-08-01",
  validTo: "",
}];

test("builds opaque UTC reminders without medication details", async () => {
  const reminders = await buildMedicationPushSchedule({
    treatmentPlan: plan,
    entries: {},
    leadMinutes: 10,
    startDateKey: "2026-08-01",
    days: 2,
    now: new Date("2026-07-31T00:00:00Z"),
  });

  assert.equal(reminders.length, 2);
  assert.equal(reminders[0].type, "medication");
  assert.match(reminders[0].id, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(reminders).includes("Sensitive medication name"), false);
  assert.equal(JSON.stringify(reminders).includes("100 mg"), false);
  assert.ok(Number.isFinite(Date.parse(reminders[0].scheduledAt)));
});

test("does not schedule a dose already recorded from the plan", async () => {
  const reminders = await buildMedicationPushSchedule({
    treatmentPlan: plan,
    entries: {
      "2026-08-01": {
        medications: [{ id: "taken", planItemId: "morning-dose" }],
      },
    },
    leadMinutes: 0,
    startDateKey: "2026-08-01",
    days: 1,
    now: new Date("2026-07-31T00:00:00Z"),
  });

  assert.deepEqual(reminders, []);
});
