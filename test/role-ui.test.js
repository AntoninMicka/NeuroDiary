import test from "node:test";
import assert from "node:assert/strict";
import { CAREGIVER_PANEL_ITEMS, getDefaultPanelForRoles, isCaregiverOnlyRoleSet } from "../src/services/roleUi.js";

test("patient role keeps the patient UI even alongside caregiver roles", () => {
  assert.equal(isCaregiverOnlyRoleSet(["patient", "doctor"]), false);
  assert.equal(getDefaultPanelForRoles(["patient", "family"]), "sekce-home");
});

test("family and doctor without patient use the caregiver UI", () => {
  assert.equal(isCaregiverOnlyRoleSet(["family"]), true);
  assert.equal(isCaregiverOnlyRoleSet(["doctor", "admin"]), true);
  assert.equal(getDefaultPanelForRoles(["doctor"]), "sekce-kartoteka");
  assert.deepEqual(CAREGIVER_PANEL_ITEMS.map((item) => item.id), [
    "sekce-kartoteka", "sekce-kontakty", "sekce-sdileni", "sekce-manualy", "sekce-udaje", "sekce-navrhy",
  ]);
});

test("missing roles and an admin-only role do not imply caregiver mode", () => {
  assert.equal(isCaregiverOnlyRoleSet([]), false);
  assert.equal(isCaregiverOnlyRoleSet(["admin"]), false);
});
