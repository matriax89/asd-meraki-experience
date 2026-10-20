/* eslint-disable @next/next/no-img-element -- ImageResponse embeds PNG assets directly; next/image is not an OG renderer. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { eventSocialCopy, type SocialEvent } from "./social-metadata";

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const MAX_POSTER_PIXELS = 25_000_000;
const POSTER_TIMEOUT_MS = 8_000;
const BACKGROUND = "#f5f4f0";
const INK = "#18251f";
const GOLD = "#c2a36b";
export const SOCIAL_IMAGE_CACHE = "public, max-age=300, s-maxage=3600";

/** Only public assets belonging to Meraki may be downloaded by this public endpoint. */
export function publicSocialPosterUrl(value: unknown, supabaseUrl: string): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const project = new URL(supabaseUrl);
    const projectAsset = project.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(project.hostname) && url.origin === project.origin && url.pathname.startsWith("/storage/v1/object/public/");
    const websiteAsset = url.origin === "https://www.merakiexperience.org" && url.pathname.startsWith("/images/");
    if (!projectAsset && !websiteAsset) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/** Invalid or unavailable posters leave the branded event preview usable. */
export async function fetchSocialPoster(value: unknown, supabaseUrl: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const url = publicSocialPosterUrl(value, supabaseUrl);
  if (!url) return null;
  try {
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(POSTER_TIMEOUT_MS),
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (!response.ok || !response.body) return null;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
      await response.body.cancel();
      return null;
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_POSTER_BYTES) {
      await response.body.cancel();
      return null;
    }
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_POSTER_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
    const bytes = Buffer.concat(chunks);
    const image = sharp(bytes, { limitInputPixels: MAX_POSTER_PIXELS, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_POSTER_PIXELS || !["png", "jpeg", "webp"].includes(metadata.format || "")) return null;
    const png = await image.rotate().resize(440, 550, { fit: "contain", background: BACKGROUND }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

let logoPromise: Promise<string | null> | undefined;
async function originalLogo(): Promise<string | null> {
  logoPromise ??= readFile(join(process.cwd(), "public/images/logo-meraki-email.png"))
    .then(bytes => `data:image/png;base64,${bytes.toString("base64")}`)
    .catch(() => null);
  return logoPromise;
}

/** The built-in local OG font covers all four supported languages; emoji must not trigger a CDN request. */
export function socialImageText(value: string, limit: number): string {
  const normalized = value.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0E\uFE0F\u200D\u20E3]/gu, "").replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  return characters.length <= limit ? normalized : `${characters.slice(0, Math.max(0, limit - 1)).join("").trimEnd()}…`;
}

function eventSchedule(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(date);
  const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(date);
  return `${day} · ${time}`;
}

export function eventSocialImageElement(event: SocialEvent, locale: string, assets: { poster: string | null; logo: string | null }) {
  const copy = eventSocialCopy(event, locale);
  const title = socialImageText(copy.title, 100);
  const description = socialImageText(copy.description, 160);
  const location = typeof event.location === "string" ? socialImageText(event.location, 62) : "";
  const schedule = eventSchedule(event.data_inizio);
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: BACKGROUND, color: INK, padding: 40, gap: 40, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", width: 440, height: 550, flexShrink: 0, alignItems: "center", justifyContent: "center", background: "#e8e9df" }}>
        {/* A PNG already fitted to 4:5 preserves every part of the original poster. */}
        {assets.poster ? <img src={assets.poster} alt="" width={440} height={550} style={{ objectFit: "contain" }} /> : (
          <div style={{ display: "flex", width: "100%", height: "100%", padding: 36, flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px solid ${GOLD}` }}>
            {assets.logo ? <img src={assets.logo} alt="Meraki Experience" width={360} height={100} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex", fontSize: 50, fontWeight: 700, textAlign: "center" }}>Meraki Experience</div>}
          </div>
        )}
      </div>
      <div style={{ display: "flex", width: 640, height: 550, flexDirection: "column", alignItems: "flex-start" }}>
        {assets.logo ? <img src={assets.logo} alt="Meraki Experience" width={270} height={65} style={{ objectFit: "contain", objectPosition: "left center" }} /> : <div style={{ display: "flex", height: 65, alignItems: "center", color: GOLD, fontSize: 25, fontWeight: 700 }}>MERAKI EXPERIENCE</div>}
        <div style={{ display: "block", width: "100%", marginTop: 24, fontSize: title.length > 65 ? 40 : 48, lineHeight: 1.12, fontWeight: 700, overflowWrap: "break-word", lineClamp: 4, textOverflow: "ellipsis" }}>{title}</div>
        {description ? <div style={{ display: "block", width: "100%", marginTop: 16, fontSize: 23, lineHeight: 1.35, color: "#59665b", overflowWrap: "break-word", lineClamp: 3, textOverflow: "ellipsis" }}>{description}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", width: "100%", flexShrink: 0, marginTop: "auto", paddingTop: 20, gap: 10, fontSize: 22, lineHeight: 1.25 }}>
          {schedule ? <div style={{ display: "flex", color: INK, fontWeight: 700 }}>{schedule}</div> : null}
          {location ? <div style={{ display: "block", color: "#59665b", lineClamp: 1, textOverflow: "ellipsis" }}>{location}</div> : null}
          <div style={{ display: "flex", color: "#92783e", fontSize: 17, marginTop: 4 }}>merakiexperience.org</div>
        </div>
      </div>
    </div>
  );
}

export async function createEventSocialImage(event: SocialEvent, locale: string, supabaseUrl: string): Promise<ImageResponse> {
  const [poster, logo] = await Promise.all([fetchSocialPoster(event.copertina_url, supabaseUrl), originalLogo()]);
  return new ImageResponse(eventSocialImageElement(event, locale, { poster, logo }), {
    width: 1200,
    height: 630,
    headers: { "Cache-Control": SOCIAL_IMAGE_CACHE, "X-Content-Type-Options": "nosniff" },
  });
}
