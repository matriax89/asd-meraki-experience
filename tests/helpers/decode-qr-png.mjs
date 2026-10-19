import { createRequire } from "node:module";
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

const require = createRequire(import.meta.url);
// Decode the actual PNG bytes, including its quiet zone, rather than trusting
// the input string passed to the independent QR encoder.
const { PNG } = require(require.resolve("pngjs", { paths: [require.resolve("qrcode")] }));

export function decodeQrPng(bytes) {
  const png = PNG.sync.read(bytes);
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4;
    luminance[pixel] = (png.data[offset] + 2 * png.data[offset + 1] + png.data[offset + 2]) / 4;
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, png.width, png.height)));
  return new QRCodeReader().decode(bitmap).getText();
}
