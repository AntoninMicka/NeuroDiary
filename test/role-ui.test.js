import test from "node:test";
import assert from "node:assert/strict";
import { CAREGIVER_PANEL_ITEMS, canAccessClinicalAnalyses, canPersistPatientData, getDefaultPanelForRoles, isCaregiverOnlyRoleSet } from "../src/services/roleUi.js";

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

test("clinical analyses require an active doctor role", () => {
  assert.equal(canAccessClinicalAnalyses(["doctor"]), true);
  assert.equal(canAccessClinicalAnalyses(["patient", "doctor"]), true);
  assert.equal(canAccessClinicalAnalyses(["patient"]), false);
  assert.equal(canAccessClinicalAnalyses(["family", "admin"]), false);
  assert.equal(canAccessClinicalAnalyses([]), false);
});

test("browser persistence is available only to accounts assigned the patient role", () => {
  assert.equal(canPersistPatientData(["patient"]), true);
  assert.equal(canPersistPatientData(["patient", "doctor"]), true);
  assert.equal(canPersistPatientData(["doctor", "admin"]), false);
  assert.equal(canPersistPatientData([]), false);
});
