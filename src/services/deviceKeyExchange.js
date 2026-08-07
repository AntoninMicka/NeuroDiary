import { getAuthorizationHeaderValue } from "./authService.js";
import { getCurrentDeviceId } from "./trustedDevices.js";

const STORAGE_KEY = "neurodiary-device-exchange-key-v1";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto API neni dostupne.");
  return globalThis.crypto;
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function endpoint(settings, path) {
  const base = (settings.endpoint || globalThis.location?.origin || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

function headers(settings) {
  const authorization = getAuthorizationHeaderValue() || (settings.apiToken?.trim() ? `Bearer ${settings.apiToken.trim()}` : "");
  return { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}), "X-Device-ID": getCurrentDeviceId() };
}

async function request(settings, path, options = {}) {
  const response = await fetch(endpoint(settings, path), { ...options, headers: headers(settings) });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail || `Device key request failed (${response.status}).`);
  return payload;
}

async function loadOrCreatePair() {
  const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "null");
  if (stored?.publicKeyJwk && stored?.privateKeyJwk) return stored;
  const pair = await cryptoApi().subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const result = {
    publicKeyJwk: await cryptoApi().subtle.exportKey("jwk", pair.publicKey),
    privateKeyJwk: await cryptoApi().subtle.exportKey("jwk", pair.privateKey),
  };
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(result));
  return result;
}

async function importPrivateKey(jwk) {
  return cryptoApi().subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

async function importPublicKey(jwk) {
  return cryptoApi().subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

export async function ensureDeviceExchangeKeyPublished(settings) {
  const pair = await loadOrCreatePair();
  const deviceId = getCurrentDeviceId();
  const challenge = await request(settings, "/api/v1/devices/key-challenge", {
    method: "POST", body: JSON.stringify({ deviceId, publicKeyJwk: pair.publicKeyJwk }),
  });
  const secret = await cryptoApi().subtle.decrypt({ name: "RSA-OAEP" }, await importPrivateKey(pair.privateKeyJwk), base64ToBytes(challenge.encryptedChallenge));
  return request(settings, "/api/v1/devices/current/key", {
    method: "PUT",
    body: JSON.stringify({ deviceId, publicKeyJwk: pair.publicKeyJwk, challengeId: challenge.challengeId, challengeSecret: DECODER.decode(secret) }),
  });
}

export async function fetchDevicePublicKeys(settings) {
  return (await request(settings, "/api/v1/devices/keys")).keys ?? [];
}

export async function encryptMasterKeyForDevice(exportedMasterKey, target) {
  const encrypted = await cryptoApi().subtle.encrypt(
    { name: "RSA-OAEP" }, await importPublicKey(target.publicKeyJwk), ENCODER.encode(exportedMasterKey),
  );
  return { algorithm: "RSA-OAEP-3072-SHA256", cipherText: bytesToBase64(new Uint8Array(encrypted)), targetFingerprint: target.fingerprint };
}

export async function publishDeviceKeyTransfer(settings, target, exportedMasterKey, keyVersion) {
  const envelope = await encryptMasterKeyForDevice(exportedMasterKey, target);
  return request(settings, "/api/v1/devices/key-transfers", {
    method: "POST", body: JSON.stringify({ targetDeviceId: target.deviceId, keyVersion, envelope, expiresInSeconds: 600 }),
  });
}

export async function publishKeyTransfersToOtherDevices(settings, exportedMasterKey, keyVersion, targetDeviceIds = null) {
  const currentId = getCurrentDeviceId();
  const selected = targetDeviceIds ? new Set(targetDeviceIds) : null;
  const targets = (await fetchDevicePublicKeys(settings)).filter((item) => item.deviceId !== currentId && (!selected || selected.has(item.deviceId)));
  return Promise.all(targets.map((target) => publishDeviceKeyTransfer(settings, target, exportedMasterKey, keyVersion)));
}

export function requestDeviceMasterKey(settings) {
  return request(settings, "/api/v1/devices/current/key-request", { method: "POST" });
}

export async function fetchDeviceKeyRequests(settings) {
  return (await request(settings, "/api/v1/devices/key-requests")).requests ?? [];
}

export async function fulfillDeviceKeyRequest(settings, keyRequest, exportedMasterKey, keyVersion) {
  const target = (await fetchDevicePublicKeys(settings)).find((item) => item.deviceId === keyRequest.targetDeviceId);
  if (!target) throw new Error("Cilove zarizeni nema overeny verejny klic.");
  const envelope = await encryptMasterKeyForDevice(exportedMasterKey, target);
  return request(settings, "/api/v1/devices/key-requests/fulfill", {
    method: "POST",
    body: JSON.stringify({ requestId: keyRequest.requestId, transfer: { targetDeviceId: target.deviceId, keyVersion, envelope, expiresInSeconds: 600 } }),
  });
}

export async function consumeDeviceKeyTransfer(settings) {
  const transfer = await request(settings, "/api/v1/devices/current/key-transfer");
  if (!transfer) return null;
  const pair = await loadOrCreatePair();
  const clear = await cryptoApi().subtle.decrypt(
    { name: "RSA-OAEP" }, await importPrivateKey(pair.privateKeyJwk), base64ToBytes(transfer.envelope.cipherText),
  );
  return { exportedMasterKey: DECODER.decode(clear), keyVersion: transfer.keyVersion, sourceDeviceId: transfer.sourceDeviceId };
}
