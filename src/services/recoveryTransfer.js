const QR_CODE_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
const RECOVERY_QR_PREFIX = "neurodiary-recovery:";

function loadScript(src, globalKey) {
  if (globalKey && globalThis[globalKey]) {
    return Promise.resolve();
  }

  const existing = document.querySelector(`script[data-src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
      if (globalKey && globalThis[globalKey]) {
        resolve();
      }
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.dataset.src = src;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
    document.head.append(script);
  });
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

  await loadScript(QR_CODE_SCRIPT_URL, "QRCode");
  await globalThis.QRCode.toCanvas(canvas, buildRecoveryTransferPayload(secret), {
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

export async function importRecoverySecretFromQrImage(file) {
  if (!canReadRecoveryQrFromImage()) {
    throw new Error("Tento prohlizec zatim neumí cist QR z obrazku.");
  }

  const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
  const bitmap = await createImageBitmap(file);
  const codes = await detector.detect(bitmap);
  const rawValue = codes[0]?.rawValue ?? "";
  if (!rawValue) {
    throw new Error("V nahranem obrazku nebyl nalezen QR kod.");
  }

  return parseRecoveryTransferPayload(rawValue);
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
