import QRCode from "qrcode";

const [url, outputPath] = process.argv.slice(2);
if (!url || !outputPath) {
  console.error("Usage: node scripts/generate_installation_qr.mjs URL OUTPUT.svg");
  process.exit(2);
}

await QRCode.toFile(outputPath, url, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  width: 512,
});

console.log(`QR code saved to ${outputPath}`);
