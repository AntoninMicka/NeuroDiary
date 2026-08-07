import test from "node:test";
import assert from "node:assert/strict";
import { buildGmailMessage, sendGmailMessage } from "../src/services/gmailService.js";

function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

test("Gmail message contains the report as a MIME attachment", async () => {
  const raw = await buildGmailMessage({
    to: "doctor@example.cz",
    subject: "Šifrovaný NeuroDiary report",
    body: "Heslo bude předáno jiným kanálem.",
    attachment: {
      filename: "neurodiary-report.zip",
      blob: new Blob(["private report"], { type: "application/zip" }),
    },
  });
  const mime = decodeBase64Url(raw);
  assert.match(mime, /To: doctor@example\.cz/);
  assert.match(mime, /Content-Disposition: attachment; filename="neurodiary-report\.zip"/);
  assert.match(mime, /cHJpdmF0ZSByZXBvcnQ=/);
  assert.doesNotMatch(mime, /private report/);
});

test("Gmail sender uses only the supplied OAuth access token", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "gmail-message-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await sendGmailMessage({
    accessToken: "temporary-google-token",
    to: "doctor@example.cz",
    subject: "NeuroDiary report",
    body: "Report v priloze.",
    attachment: {
      filename: "neurodiary-report.pdf",
      blob: new Blob(["pdf"], { type: "application/pdf" }),
    },
  });

  assert.equal(result.id, "gmail-message-1");
  assert.equal(request.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(request.options.headers.Authorization, "Bearer temporary-google-token");
  assert.ok(JSON.parse(request.options.body).raw);
});
