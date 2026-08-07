import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { createDoctorReportPdfBlob } from "./doctorReport.js";
import { encryptBlobForContact } from "./contactKeyring.js";

const CONTACT_KEY = "neurodiary-doctor-contact-v1";

export function loadDoctorContact() {
  try {
    return { name: "", email: "", ...JSON.parse(globalThis.localStorage?.getItem(CONTACT_KEY) ?? "{}") };
  } catch {
    return { name: "", email: "" };
  }
}

export function saveDoctorContact(contact) {
  const value = { name: String(contact.name ?? "").trim().slice(0, 120), email: String(contact.email ?? "").trim().slice(0, 254) };
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new Error("E-mail kontaktu nema platny format.");
  globalThis.localStorage?.setItem(CONTACT_KEY, JSON.stringify(value));
  return value;
}

export function generateReportPassword() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").match(/.{1,6}/g).join("-");
}

export async function encryptReportPdfBlob(pdfBlob, filename, password) {
  if (password.replaceAll("-", "").length < 16) throw new Error("Heslo musi mit alespon 16 znaku.");
  const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
  await zipWriter.add(filename, new BlobReader(pdfBlob), { password, encryptionStrength: 3 });
  return zipWriter.close();
}

export async function createEncryptedReportArchive(reportOptions, password = generateReportPassword()) {
  const pdfBlob = await createDoctorReportPdfBlob(reportOptions);
  const blob = await encryptReportPdfBlob(
    pdfBlob,
    "neurodiary-report.pdf",
    password,
  );
  return { blob, password };
}

export async function createPlainReportAttachment(reportOptions) {
  return {
    blob: await createDoctorReportPdfBlob(reportOptions),
    filename: "neurodiary-report.pdf",
    encryption: "none",
    password: "",
  };
}

export async function createProtectedReportAttachment(reportOptions, contact, password = generateReportPassword()) {
  const usesPublicKey = Boolean(contact?.publicKeyPem);
  if (usesPublicKey) {
    return {
      blob: await encryptBlobForContact(await createDoctorReportPdfBlob(reportOptions), contact),
      filename: "neurodiary-report.ndreport",
      encryption: "public-key",
      password: "",
    };
  }
  const encrypted = await createEncryptedReportArchive(reportOptions, password);
  return {
    ...encrypted,
    filename: "neurodiary-report.zip",
    encryption: "password",
  };
}

export async function sharePlainReport({ reportOptions, contact }) {
  const safeContact = {
    name: String(contact?.name ?? "").trim().slice(0, 120),
    email: String(contact?.email ?? "").trim().slice(0, 254),
  };
  if (!safeContact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeContact.email)) {
    throw new Error("Doplnte platny e-mail lekare.");
  }

  const attachment = await createPlainReportAttachment(reportOptions);
  const file = new File([attachment.blob], attachment.filename, { type: attachment.blob.type });
  const shareData = {
    files: [file],
    title: "NeuroDiary report",
    text: `Pro ${safeContact.name || safeContact.email}.`,
  };
  if (globalThis.navigator?.share && globalThis.navigator.canShare?.({ files: [file] })) {
    await globalThis.navigator.share(shareData);
    return { method: "native-share", encryption: "none" };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  const subject = encodeURIComponent("NeuroDiary report");
  const body = encodeURIComponent("V priloze posilam NeuroDiary report. PDF bylo stazeno a je potreba ho k e-mailu pridat.");
  globalThis.location.href = `mailto:${encodeURIComponent(safeContact.email)}?subject=${subject}&body=${body}`;
  return { method: "download-and-email", encryption: "none" };
}

export async function shareEncryptedReport({ reportOptions, contact, password }) {
  const safeContact = contact?.id ? contact : saveDoctorContact(contact);
  if (!safeContact.email) throw new Error("Doplnte e-mail lekare.");
  const usesPublicKey = Boolean(safeContact.publicKeyPem);
  const encrypted = await createProtectedReportAttachment(reportOptions, safeContact, password);
  const file = new File([encrypted.blob], encrypted.filename, { type: encrypted.blob.type });
  const shareData = {
    files: [file],
    title: "Sifrovany NeuroDiary report",
    text: usesPublicKey
      ? `Pro ${safeContact.name || safeContact.email}. Report je zasifrovan verejnym klicem prijemce.`
      : `Pro ${safeContact.name || safeContact.email}. Heslo k priloze bude predano jinym kanalem.`,
  };
  if (globalThis.navigator?.share && globalThis.navigator.canShare?.({ files: [file] })) {
    await globalThis.navigator.share(shareData);
    return { ...encrypted, method: "native-share", encryption: usesPublicKey ? "public-key" : "password" };
  }
  const url = URL.createObjectURL(encrypted.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  const subject = encodeURIComponent("Sifrovany NeuroDiary report");
  const body = encodeURIComponent(usesPublicKey
    ? "V priloze posilam report zasifrovany vasim verejnym klicem. Priloha byla stazena a je potreba ji k e-mailu pridat."
    : "V priloze posilam sifrovany report. Heslo predam jinym kanalem. Priloha byla stazena a je potreba ji k e-mailu pridat.");
  globalThis.location.href = `mailto:${encodeURIComponent(safeContact.email)}?subject=${subject}&body=${body}`;
  return { ...encrypted, method: "download-and-email", encryption: usesPublicKey ? "public-key" : "password" };
}
