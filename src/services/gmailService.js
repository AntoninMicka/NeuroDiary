function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

function utf8ToBase64Url(value) {
  const base64 = bytesToBase64(new TextEncoder().encode(value));
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function encodeHeader(value) {
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

export async function buildGmailMessage({ to, subject, body, attachment }) {
  const boundary = `neurodiary-${globalThis.crypto.randomUUID()}`;
  const attachmentBytes = new Uint8Array(await attachment.blob.arrayBuffer());
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    bytesToBase64(new TextEncoder().encode(body)),
    `--${boundary}`,
    `Content-Type: ${attachment.blob.type || "application/octet-stream"}; name="${attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    "",
    bytesToBase64(attachmentBytes),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return utf8ToBase64Url(mime);
}

export async function sendGmailMessage({ accessToken, to, subject, body, attachment }) {
  const raw = await buildGmailMessage({ to, subject, body, attachment });
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gmail vratil chybu HTTP ${response.status}.`);
  }
  return payload;
}
