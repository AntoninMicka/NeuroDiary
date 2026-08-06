const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const AES_ALGORITHM = "AES-GCM";
const PBKDF2_ALGORITHM = "PBKDF2";
const AES_KEY_LENGTH = 256;
const RECOVERY_DERIVATION_ITERATIONS = 250000;
const RECOVERY_SALT_BYTES = 16;
const AES_IV_BYTES = 12;
const RECOVERY_SECRET_BYTES = 32;

function ensureCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }

  return globalThis.crypto;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeRecoverySecret(secret) {
  return secret.trim().replaceAll("-", "").replaceAll(" ", "");
}

export function generateRecoverySecret() {
  const cryptoApi = ensureCrypto();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(RECOVERY_SECRET_BYTES));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateAccountMasterKey() {
  const cryptoApi = ensureCrypto();
  return cryptoApi.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportAccountMasterKey(key) {
  const cryptoApi = ensureCrypto();
  const rawKey = await cryptoApi.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(rawKey));
}

export async function importAccountMasterKey(base64Key) {
  const cryptoApi = ensureCrypto();
  return cryptoApi.subtle.importKey(
    "raw",
    base64ToBytes(base64Key),
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

async function deriveRecoveryWrappingKey(recoverySecret, salt, iterations = RECOVERY_DERIVATION_ITERATIONS) {
  const cryptoApi = ensureCrypto();
  const normalizedSecret = normalizeRecoverySecret(recoverySecret);
  const secretKeyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(normalizedSecret),
    PBKDF2_ALGORITHM,
    false,
    ["deriveKey"],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: PBKDF2_ALGORITHM,
      salt,
      iterations,
      hash: "SHA-256",
    },
    secretKeyMaterial,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapAccountMasterKey(masterKey, recoverySecret, keyVersion = 1) {
  const cryptoApi = ensureCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(RECOVERY_SALT_BYTES));
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const wrappingKey = await deriveRecoveryWrappingKey(
    recoverySecret,
    salt,
    RECOVERY_DERIVATION_ITERATIONS,
  );
  const exportedMasterKey = await cryptoApi.subtle.exportKey("raw", masterKey);
  const wrappedKeyBuffer = await cryptoApi.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    wrappingKey,
    exportedMasterKey,
  );

  return {
    wrappedKey: bytesToBase64(new Uint8Array(wrappedKeyBuffer)),
    wrappingAlgorithm: "PBKDF2-AES-GCM-256",
    wrappingSalt: bytesToBase64(salt),
    wrappingIv: bytesToBase64(iv),
    wrappingIterations: RECOVERY_DERIVATION_ITERATIONS,
    keyVersion,
  };
}

export async function unwrapAccountMasterKey(wrappedKeyEnvelope, recoverySecret) {
  const cryptoApi = ensureCrypto();
  const wrappingKey = await deriveRecoveryWrappingKey(
    recoverySecret,
    base64ToBytes(wrappedKeyEnvelope.wrappingSalt),
    wrappedKeyEnvelope.wrappingIterations,
  );

  const rawMasterKey = await cryptoApi.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: base64ToBytes(wrappedKeyEnvelope.wrappingIv),
    },
    wrappingKey,
    base64ToBytes(wrappedKeyEnvelope.wrappedKey),
  );

  return cryptoApi.subtle.importKey(
    "raw",
    rawMasterKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptDiaryState(state, masterKey, keyVersion = 1) {
  const cryptoApi = ensureCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const serializedState = JSON.stringify(state);
  const encryptedBuffer = await cryptoApi.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    masterKey,
    TEXT_ENCODER.encode(serializedState),
  );

  return {
    schemaVersion: 1,
    algorithm: "AES-GCM-256",
    keyVersion,
    iv: bytesToBase64(iv),
    cipherText: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptDiaryState(encryptedPayload, masterKey) {
  const cryptoApi = ensureCrypto();
  const decryptedBuffer = await cryptoApi.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: base64ToBytes(encryptedPayload.iv),
    },
    masterKey,
    base64ToBytes(encryptedPayload.cipherText),
  );

  return JSON.parse(TEXT_DECODER.decode(decryptedBuffer));
}
