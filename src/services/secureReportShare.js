import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { createDoctorReportPdfBlob } from "./doctorReport.js";

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

export async function shareEncryptedReport({ reportOptions, contact, password }) {
  const safeContact = saveDoctorContact(contact);
  if (!safeContact.email) throw new Error("Doplnte e-mail lekare.");
  const encrypted = await createEncryptedReportArchive(reportOptions, password);
  const file = new File([encrypted.blob], "neurodiary-report.zip", { type: "application/zip" });
  const shareData = {
    files: [file],
    title: "Sifrovany NeuroDiary report",
    text: `Pro ${safeContact.name || safeContact.email}. Heslo k priloze bude predano jinym kanalem.`,
  };
  if (globalThis.navigator?.share && globalThis.navigator.canShare?.({ files: [file] })) {
    await globalThis.navigator.share(shareData);
    return { ...encrypted, method: "native-share" };
  }
  const url = URL.createObjectURL(encrypted.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  const subject = encodeURIComponent("Sifrovany NeuroDiary report");
  const body = encodeURIComponent("V priloze posilam sifrovany report. Heslo predam jinym kanalem. Priloha byla stazena a je potreba ji k e-mailu pridat.");
  globalThis.location.href = `mailto:${encodeURIComponent(safeContact.email)}?subject=${subject}&body=${body}`;
  return { ...encrypted, method: "download-and-email" };
}
