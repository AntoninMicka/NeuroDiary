import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptContactEnvelope,
  deleteContact,
  encryptBlobForContact,
  generateContactKeyPair,
  loadContacts,
  saveContact,
} from "../src/services/contactKeyring.js";

function useMemoryStorage() {
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
}

test("contact keyring validates, fingerprints, updates and deletes contacts", async () => {
  useMemoryStorage();
  const keys = await generateContactKeyPair();
  const created = await saveContact({ name: "MUDr. Novak", email: "NOVAK@example.cz", publicKeyPem: keys.publicKeyPem });
  assert.equal(created.email, "novak@example.cz");
  assert.match(created.keyFingerprint, /^([0-9a-f]{4}:){15}[0-9a-f]{4}$/);
  assert.equal(loadContacts().length, 1);

  const updated = await saveContact({ ...created, name: "MUDr. Jan Novak" });
  assert.equal(updated.id, created.id);
  assert.equal(loadContacts()[0].name, "MUDr. Jan Novak");
  assert.deepEqual(deleteContact(created.id), []);
});

test("report envelope can only be decrypted with recipient private key", async () => {
  useMemoryStorage();
  const recipient = await generateContactKeyPair();
  const stranger = await generateContactKeyPair();
  const contact = await saveContact({ name: "Lekar", email: "doctor@example.cz", publicKeyPem: recipient.publicKeyPem });
  const encrypted = await encryptBlobForContact(new Blob(["citliva data"], { type: "application/pdf" }), contact);
  const decrypted = await decryptContactEnvelope(encrypted, recipient.privateKeyPem);
  assert.equal(await decrypted.blob.text(), "citliva data");
  assert.equal(decrypted.filename, "neurodiary-report.pdf");
  await assert.rejects(() => decryptContactEnvelope(encrypted, stranger.privateKeyPem));
});

test("invalid public keys and duplicate e-mails are rejected", async () => {
  useMemoryStorage();
  await saveContact({ name: "Prvni", email: "same@example.cz" });
  await assert.rejects(() => saveContact({ name: "Druhy", email: "same@example.cz" }), /uz existuje/);
  await assert.rejects(
    () => saveContact({ name: "Treti", email: "third@example.cz", publicKeyPem: "not a key" }),
    /PEM/,
  );
});
