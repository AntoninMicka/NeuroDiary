import test from "node:test";
import assert from "node:assert/strict";

import {
  appendHourStateRecord,
  createInitialState,
  createMedication,
  ensureEntry,
  markMedicationDeleted,
  mergeDiaryStatesAppendOnly,
} from "../src/domain/diary.js";

function createDeviceState(updatedAt, notes) {
  const state = createInitialState();
  state.selectedDate = "2026-08-06";
  const entry = ensureEntry(state, state.selectedDate);
  entry.notes = notes;
  entry.updatedAt = updatedAt;
  return state;
}

test("newer day values win while concurrent hour records from both devices survive", () => {
  const remote = createDeviceState("2026-08-06T12:00:00.000Z", "novější poznámka");
  remote.entries[remote.selectedDate].overallStatus = "good";
  appendHourStateRecord(remote.entries[remote.selectedDate], "8", "on", {
    recordedAt: "2026-08-06T08:05:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  });

  const local = createDeviceState("2026-08-06T11:00:00.000Z", "starší poznámka");
  local.entries[local.selectedDate].overallStatus = "hard";
  appendHourStateRecord(local.entries[local.selectedDate], "8", "off", {
    recordedAt: "2026-08-06T08:10:00.000Z",
    updatedAt: "2026-08-06T11:00:00.000Z",
  });

  const merged = mergeDiaryStatesAppendOnly(remote, local);
  const entry = merged.entries[remote.selectedDate];

  assert.equal(entry.notes, "novější poznámka");
  assert.equal(entry.overallStatus, "good");
  assert.equal(entry.hourRecords["8"].length, 2);
  assert.equal(entry.hours["8"], "off");
});

test("concurrent doses are preserved and a deletion tombstone prevents resurrection", () => {
  const remote = createDeviceState("2026-08-06T12:00:00.000Z", "");
  const local = createDeviceState("2026-08-06T12:01:00.000Z", "");
  remote.entries[remote.selectedDate].medications.push(createMedication({
    id: "remote-dose",
    name: "Levodopa",
    dose: "100 mg",
    time: "08:00",
  }));
  local.entries[local.selectedDate].medications.push(createMedication({
    id: "local-dose",
    name: "Levodopa",
    dose: "100 mg",
    time: "12:00",
  }));

  const combined = mergeDiaryStatesAppendOnly(remote, local);
  assert.deepEqual(
    combined.entries[remote.selectedDate].medications.map((item) => item.id).sort(),
    ["local-dose", "remote-dose"],
  );

  markMedicationDeleted(local, "remote-dose", "2026-08-06T12:02:00.000Z");
  const afterDeletion = mergeDiaryStatesAppendOnly(remote, local);
  assert.deepEqual(
    afterDeletion.entries[remote.selectedDate].medications.map((item) => item.id),
    ["local-dose"],
  );
});
