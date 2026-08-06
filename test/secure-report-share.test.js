import test from "node:test";
import assert from "node:assert/strict";
import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";
import { encryptReportPdfBlob, generateReportPassword } from "../src/services/secureReportShare.js";

test("report attachment uses a strong generated password and AES encrypted ZIP", async () => {
  const password = generateReportPassword();
  assert.equal(password.replaceAll("-", "").length, 36);
  const archive = await encryptReportPdfBlob(new Blob(["private pdf"]), "report.pdf", password);
  const reader = new ZipReader(new BlobReader(archive));
  const [entry] = await reader.getEntries();
  assert.equal(entry.encrypted, true);
  const output = await entry.getData(new BlobWriter(), { password });
  assert.equal(await output.text(), "private pdf");
  await assert.rejects(() => entry.getData(new BlobWriter(), { password: "wrong-password-value" }));
  await reader.close();
});
