import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// Keep the original Meraki artwork intact; only trim its transparent margins.
const artwork = await sharp("public/images/logo-meraki.png").trim().png().toBuffer();
const { width, height } = await sharp(artwork).metadata();
const { data, info } = await sharp(artwork).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let radius = 0;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      radius = Math.max(radius, Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2));
    }
  }
}

async function createIcon(size, stem, maskable = false) {
  // Maskable artwork stays inside a circle smaller than the required 40% safe zone.
  const scale = maskable ? (size * 0.38) / radius : (size * 0.84) / Math.max(width, height);
  const logoWidth = Math.round(width * scale);
  const logoHeight = Math.round(height * scale);
  const resized = await sharp(artwork).resize(logoWidth, logoHeight).png().toBuffer();
  const icon = await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: resized, left: Math.floor((size - logoWidth) / 2), top: Math.floor((size - logoHeight) / 2) }])
    .png().toBuffer();
  await writeFile(`public/icons/${stem}.png`, icon);
  return icon;
}

const small = await createIcon(192, "meraki-original-192");
const large = await createIcon(512, "meraki-original-512");
const maskable = await createIcon(512, "meraki-original-maskable-512", true);
const apple = await createIcon(180, "meraki-original-apple-touch-icon");
// Update legacy URLs too, so existing bookmarks never retain an invented monogram.
await Promise.all([
  writeFile("public/icons/meraki-192.png", small),
  writeFile("public/icons/meraki-512.png", large),
  writeFile("public/icons/meraki-maskable-512.png", maskable),
  writeFile("public/icons/apple-touch-icon.png", apple),
  writeFile("public/icons/meraki.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Meraki Experience</title><image width="512" height="512" href="data:image/png;base64,${large.toString("base64")}"/></svg>\n`),
]);
