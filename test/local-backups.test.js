import test from "node:test";
import assert from "node:assert/strict";
import { shouldCreateAutomaticBackup } from "../src/services/localBackups.js";

test("automatic backup is created at most once per day", () => {
  const backups = [{ reason: "automatic", createdAt: "2026-08-06T08:00:00.000Z" }];
  assert.equal(shouldCreateAutomaticBackup(backups, new Date("2026-08-06T20:00:00.000Z")), false);
  assert.equal(shouldCreateAutomaticBackup(backups, new Date("2026-08-07T08:01:00.000Z")), true);
  assert.equal(shouldCreateAutomaticBackup([], new Date("2026-08-06T20:00:00.000Z")), true);
});
