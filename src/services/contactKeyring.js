const STORAGE_KEY = "neurodiary-contact-keyring-v1";
const LEGACY_STORAGE_KEY = "neurodiary-doctor-contact-v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENCODER = new TextEncoder();

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto API neni v tomto prohlizeci dostupne.");
  return globalThis.crypto;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pemToBytes(pem, label) {
  const match = String(pem ?? "").trim().match(new RegExp(`^-----BEGIN ${label}-----([\\s\\S]+)-----END ${label}-----$`));
  if (!match) throw new Error(`Klic musi byt ve formatu PEM (${label}).`);
  return base64ToBytes(match[1]);
}

function bytesToPem(bytes, label) {
  const encoded = bytesToBase64(bytes);
  const lines = encoded.match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function cleanContact(input, existing = {}) {
  const name = String(input.name ?? "").trim().slice(0, 120);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!name) throw new Error("Doplnte jmeno kontaktu.");
  if (!email || !EMAIL_PATTERN.test(email)) throw new Error("E-mail kontaktu nema platny format.");
  return {
    id: String(input.id || existing.id || globalThis.crypto.randomUUID()),
    name,
    email,
    publicKeyPem: String(input.publicKeyPem ?? existing.publicKeyPem ?? "").trim(),
    keyFingerprint: String(input.keyFingerprint ?? existing.keyFingerprint ?? ""),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadContacts() {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(stored)) return stored;
  } catch { /* Ignore corrupt local data. */ }
  try {
    const legacy = JSON.parse(globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY) ?? "{}");
    if (legacy.name || legacy.email) return [{ ...cleanContact({ name: legacy.name || legacy.email, email: legacy.email }), publicKeyPem: "" }];
  } catch { /* Ignore invalid legacy data. */ }
  return [];
}

function persist(contacts) {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(contacts));
  return contacts;
}

export async function saveContact(input) {
  const contacts = loadContacts();
  const index = contacts.findIndex((contact) => contact.id === input.id);
  const contact = cleanContact(input, contacts[index]);
  if (contacts.some((item, itemIndex) => itemIndex !== index && item.email === contact.email)) {
    throw new Error("Kontakt s timto e-mailem uz existuje.");
  }
  if (contact.publicKeyPem) {
    await importContactPublicKey(contact.publicKeyPem);
    contact.keyFingerprint = await fingerprintPublicKey(contact.publicKeyPem);
  } else {
    contact.keyFingerprint = "";
  }
  if (index < 0) contacts.push(contact); else contacts[index] = contact;
  persist(contacts);
  return contact;
}

export function deleteContact(id) {
  return persist(loadContacts().filter((contact) => contact.id !== id));
}

export async function importContactPublicKey(publicKeyPem) {
  return cryptoApi().subtle.importKey(
    "spki",
    pemToBytes(publicKeyPem, "PUBLIC KEY"),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
}

export async function fingerprintPublicKey(publicKeyPem) {
  const digest = new Uint8Array(await cryptoApi().subtle.digest("SHA-256", pemToBytes(publicKeyPem, "PUBLIC KEY")));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("").match(/.{1,4}/g).join(":");
}

export async function generateContactKeyPair() {
  const pair = await cryptoApi().subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKey = new Uint8Array(await cryptoApi().subtle.exportKey("spki", pair.publicKey));
  const privateKey = new Uint8Array(await cryptoApi().subtle.exportKey("pkcs8", pair.privateKey));
  return {
    publicKeyPem: bytesToPem(publicKey, "PUBLIC KEY"),
    privateKeyPem: bytesToPem(privateKey, "PRIVATE KEY"),
    fingerprint: await fingerprintPublicKey(bytesToPem(publicKey, "PUBLIC KEY")),
  };
}

export async function encryptBlobForContact(blob, contact, filename = "neurodiary-report.pdf") {
  if (!contact?.publicKeyPem) throw new Error("Kontakt nemá uložený veřejný klíč.");
  const api = cryptoApi();
  const publicKey = await importContactPublicKey(contact.publicKeyPem);
  const contentKey = await api.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = api.getRandomValues(new Uint8Array(12));
  const wrappedKey = await api.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, await api.subtle.exportKey("raw", contentKey));
  const cipherText = await api.subtle.encrypt({ name: "AES-GCM", iv }, contentKey, await blob.arrayBuffer());
  const envelope = {
    format: "neurodiary-encrypted-report",
    version: 1,
    algorithms: { content: "AES-256-GCM", key: "RSA-OAEP-3072-SHA256" },
    recipient: { id: contact.id, email: contact.email, keyFingerprint: contact.keyFingerprint || await fingerprintPublicKey(contact.publicKeyPem) },
    filename,
    mimeType: blob.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
    iv: bytesToBase64(iv),
    encryptedKey: bytesToBase64(new Uint8Array(wrappedKey)),
    cipherText: bytesToBase64(new Uint8Array(cipherText)),
  };
  return new Blob([ENCODER.encode(JSON.stringify(envelope))], { type: "application/vnd.neurodiary.encrypted+json" });
}

export async function decryptContactEnvelope(blob, privateKeyPem) {
  const envelope = JSON.parse(await blob.text());
  if (envelope.format !== "neurodiary-encrypted-report" || envelope.version !== 1) throw new Error("Neznámý formát šifrovaného reportu.");
  const api = cryptoApi();
  const privateKey = await api.subtle.importKey("pkcs8", pemToBytes(privateKeyPem, "PRIVATE KEY"), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const rawKey = await api.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToBytes(envelope.encryptedKey));
  const contentKey = await api.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const clear = await api.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, contentKey, base64ToBytes(envelope.cipherText));
  return { blob: new Blob([clear], { type: envelope.mimeType }), filename: envelope.filename, envelope };
}
