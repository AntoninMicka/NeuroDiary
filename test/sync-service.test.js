import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/domain/diary.js";
import {
  decryptDiaryState,
  encryptDiaryState,
  generateAccountMasterKey,
  unwrapAccountMasterKey,
  wrapAccountMasterKey,
} from "../src/services/e2eCrypto.js";
import {
  initializeCloudSync,
  pullCloudState,
  pushCloudState,
  saveSyncKeyMaterial,
  rotateCloudEncryption,
} from "../src/services/syncService.js";

function installMemoryStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test("E2E envelope round-trips diary data and rejects a wrong recovery secret", async () => {
  const masterKey = await generateAccountMasterKey();
  const state = { patientName: "Citlive jmeno", entries: { "2026-08-05": { notes: "Soukroma poznamka" } } };
  const encrypted = await encryptDiaryState(state, masterKey);
  const wrapped = await wrapAccountMasterKey(masterKey, "correct recovery secret");

  assert.equal(JSON.stringify(encrypted).includes("Citlive jmeno"), false);
  assert.deepEqual(await decryptDiaryState(encrypted, masterKey), state);
  await assert.rejects(() => unwrapAccountMasterKey(wrapped, "wrong recovery secret"));

  const restoredKey = await unwrapAccountMasterKey(wrapped, "correct recovery secret");
  assert.deepEqual(await decryptDiaryState(encrypted, restoredKey), state);
});

test("a new device restores the encrypted cloud snapshot using only the recovery secret", async (context) => {
  installMemoryStorage();
  const settings = { endpoint: "https://sync.example.test", apiToken: "test-token", userId: "user-1" };
  const state = createInitialState();
  state.patientName = "Cloud patient";
  state.entries["2026-08-05"] = { notes: "Encrypted note", medications: [], hours: {}, hourRecords: {} };

  let serverSnapshot = null;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "POST") {
      const request = JSON.parse(options.body);
      serverSnapshot = {
        status: "ok",
        revision: 1,
        updatedAt: "2026-08-05T12:00:00Z",
        payload: request.payload,
        wrappedKey: request.wrappedKey,
      };
      return jsonResponse(serverSnapshot);
    }
    return jsonResponse(serverSnapshot);
  });

  const initialized = await initializeCloudSync({
    state,
    settings,
    recoverySecret: "device transfer secret",
  });

  assert.equal(initialized.revision, 1);
  assert.equal(JSON.stringify(serverSnapshot).includes("Cloud patient"), false);
  assert.equal(JSON.stringify(serverSnapshot).includes("Encrypted note"), false);

  saveSyncKeyMaterial({
    userId: "user-1",
    exportedMasterKey: "",
    recoverySecret: "device transfer secret",
  });
  const pulled = await pullCloudState(settings);

  assert.equal(pulled.revision, 1);
  assert.equal(pulled.state.patientName, "Cloud patient");
  assert.equal(pulled.state.entries["2026-08-05"].notes, "Encrypted note");
});

test("push exposes a decryptable remote state when the server reports a revision conflict", async (context) => {
  installMemoryStorage();
  const settings = { endpoint: "https://sync.example.test", apiToken: "test-token", userId: "user-1" };
  const localState = createInitialState();
  const remoteState = createInitialState();
  remoteState.patientName = "Remote version";
  let firstPush = null;

  context.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    if (!firstPush) {
      firstPush = request;
      return jsonResponse({
        status: "ok",
        revision: 1,
        updatedAt: "2026-08-05T12:00:00Z",
        wrappedKey: request.wrappedKey,
      });
    }

    const masterKeyEnvelope = firstPush.wrappedKey;
    const masterKey = await unwrapAccountMasterKey(masterKeyEnvelope, "conflict secret");
    return jsonResponse({
      status: "conflict",
      revision: 2,
      updatedAt: "2026-08-05T12:01:00Z",
      payload: await encryptDiaryState(remoteState, masterKey),
      wrappedKey: masterKeyEnvelope,
    });
  });

  await initializeCloudSync({ state: localState, settings, recoverySecret: "conflict secret" });
  const conflict = await pushCloudState({ state: localState, settings, baseRevision: 1 });

  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.revision, 2);
  assert.equal(conflict.remoteState.patientName, "Remote version");
});

test("key rotation replaces local key material and produces a new recovery secret", async (context) => {
  installMemoryStorage();
  const settings = { endpoint: "https://sync.example.test", apiToken: "test-token", userId: "user-1" };
  const state = createInitialState();
  let requestBody = null;
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (url.endsWith("/api/v1/devices/keys")) return jsonResponse({ keys: [] });
    requestBody = JSON.parse(options.body);
    return jsonResponse({ status: "ok", revision: 8, updatedAt: "2026-08-06T12:00:00Z" });
  });

  const result = await rotateCloudEncryption({ state, settings, baseRevision: 7 });
  assert.equal(result.revision, 8);
  assert.equal(result.keyVersion, 2);
  assert.equal(result.recoverySecret.length, 64);
  assert.equal(requestBody.force, true);
  assert.equal(requestBody.payload.keyVersion, 2);
  assert.equal(requestBody.wrappedKey.keyVersion, 2);
  assert.equal(result.transferredDeviceCount, 0);
});
