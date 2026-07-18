import QRCode from "qrcode";

const RECOVERY_QR_PREFIX = "neurodiary-recovery:";

function createRecoveryQrDetector() {
  if (typeof globalThis.BarcodeDetector !== "function") {
    throw new Error("Tento prohlizec zatim neumí cist QR kody.");
  }

  return new globalThis.BarcodeDetector({ formats: ["qr_code"] });
}

export function buildRecoveryTransferPayload(secret) {
  return `${RECOVERY_QR_PREFIX}${secret.trim()}`;
}

export function parseRecoveryTransferPayload(value) {
  const normalizedValue = String(value ?? "").trim();
  const rawSecret = normalizedValue.startsWith(RECOVERY_QR_PREFIX)
    ? normalizedValue.slice(RECOVERY_QR_PREFIX.length)
    : normalizedValue;
  const compactSecret = rawSecret.replaceAll("-", "").replaceAll(" ", "").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(compactSecret)) {
    throw new Error("QR kod neobsahuje platny recovery secret.");
  }

  return compactSecret;
}

export async function renderRecoverySecretQr(canvas, secret) {
  if (!canvas) {
    return;
  }

  if (!String(secret ?? "").trim()) {
    throw new Error("Recovery secret zatim neni pripraven.");
  }

  await QRCode.toCanvas(canvas, buildRecoveryTransferPayload(secret), {
    width: 240,
    margin: 1,
    color: {
      dark: "#1f2933",
      light: "#fffdf8",
    },
  });
}

export function canReadRecoveryQrFromImage() {
  return typeof globalThis.BarcodeDetector === "function";
}

export function canScanRecoveryQrFromCamera() {
  return (
    canReadRecoveryQrFromImage()
    && typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function"
  );
}

export async function readRecoverySecretFromQrSource(source) {
  const detector = createRecoveryQrDetector();
  const codes = await detector.detect(source);
  const rawValue = codes[0]?.rawValue ?? "";
  if (!rawValue) {
    return "";
  }

  return parseRecoveryTransferPayload(rawValue);
}

export async function importRecoverySecretFromQrImage(file) {
  if (!canReadRecoveryQrFromImage()) {
    throw new Error("Tento prohlizec zatim neumí cist QR z obrazku.");
  }

  const bitmap = await createImageBitmap(file);
  const secret = await readRecoverySecretFromQrSource(bitmap);
  if (!secret) {
    throw new Error("V nahranem obrazku nebyl nalezen QR kod.");
  }

  return secret;
}

export function downloadRecoveryQr(canvas, filename = "neurodiary-recovery-secret.png") {
  const url = canvas?.toDataURL?.("image/png");
  if (!url) {
    throw new Error("QR kod zatim neni pripraven k ulozeni.");
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}
