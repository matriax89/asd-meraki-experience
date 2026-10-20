import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { richText } from "./helpers/rich-text-modules.mjs";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), process, Buffer, Date, Intl, URL, AbortSignal, Response, fetch, console, ...environment });
  return compiledModule.exports;
}
const i18n = load("src/lib/i18n-utils.ts");
const metadata = load("src/lib/events/social-metadata.ts", { "@/lib/i18n-utils": i18n, "@/lib/rich-text": richText });
const images = load("src/lib/events/social-image.tsx", { "./social-metadata": metadata });
const project = "https://ouygnyulrlwkiccbyeat.supabase.co";
const posterUrl = `${project}/storage/v1/object/public/events/poster.jpg`;
const event = {
  id: "30da43c2-3ee7-4e7d-97b4-28c789e366de", slug: "vibra", tipo: "evento",
  titolo: { it: "Vivi l’esperienza Meraki", en: "Enjoy the Meraki experience", de: "Spüre die Meraki-Begeisterung", es: "Vive la experiencia Meraki" },
  descrizione: { it: "<p>Workshop e <strong>masterclass</strong> per tutti.</p>", en: "<p>Workshop and <strong>masterclass</strong> for everyone.</p>", de: "<p>Workshop und <strong>Masterclass</strong> für alle.</p>", es: "<p>Taller y <strong>masterclass</strong> para todos.</p>" },
  data_inizio: "2026-12-19T12:30:00Z", copertina_url: posterUrl, location: "Black Box – Laives (BZ)", updated_at: "2026-10-20T20:00:00Z",
};

test("the public image downloader only accepts HTTPS Meraki storage and canonical public images", () => {
  assert.equal(images.publicSocialPosterUrl(posterUrl, project).href, posterUrl);
  assert.equal(images.publicSocialPosterUrl("https://www.merakiexperience.org/images/poster.png#preview", project).href, "https://www.merakiexperience.org/images/poster.png");
  for (const url of [null, "", "/images/poster.png", "http://www.merakiexperience.org/images/poster.png", "https://localhost/images/a.png", "https://127.0.0.1/images/a.png", "https://www.merakiexperience.org.evil.test/images/a.png", "https://www.merakiexperience.org:444/images/a.png", "https://user:pass@www.merakiexperience.org/images/a.png", "https://www.merakiexperience.org/api/private", `${project}/storage/v1/object/sign/events/poster.png`, `${project}/auth/v1/user`, "https://external.example.test/image.png", "file:///etc/passwd", "data:image/png;base64,AAAA"]) assert.equal(images.publicSocialPosterUrl(url, project), null, String(url));
  assert.equal(images.publicSocialPosterUrl("https://localhost/storage/v1/object/public/a.png", "https://localhost"), null);
});

test("JPEG and WebP posters are converted to PNG with the full 4:5 image and bounded download settings", async () => {
  const original = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#bb0000" } }).composite([{ input: await sharp({ create: { width: 80, height: 20, channels: 3, background: "#0000cc" } }).png().toBuffer(), top: 80, left: 0 }]).png().toBuffer();
  for (const format of ["jpeg", "webp", "png"]) {
    const bytes = await sharp(original).toFormat(format).toBuffer();
    const converted = await images.fetchSocialPoster(posterUrl, project, async (url, options) => {
      assert.equal(url.href, posterUrl); assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Accept, "image/png,image/jpeg,image/webp");
      return new Response(bytes, { headers: { "Content-Type": `image/${format}` } });
    });
    assert.match(converted, /^data:image\/png;base64,/);
    const png = Buffer.from(converted.split(",")[1], "base64");
    const size = await sharp(png).metadata(); assert.equal(size.width, 440); assert.equal(size.height, 550); assert.equal(size.format, "png");
    const top = await sharp(png).extract({ left: 220, top: 5, width: 1, height: 1 }).raw().toBuffer();
    const bottom = await sharp(png).extract({ left: 220, top: 545, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(top[0] > 140 && top[2] < 50, "the top edge of the original is present");
    assert.ok(bottom[2] > 140 && bottom[0] < 50, "the bottom edge of the original is present");
  }
});

test("portrait and landscape assets are contained rather than cropped", async () => {
  for (const [width, height] of [[100, 200], [200, 100]]) {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#cc0000" } }).png().toBuffer();
    const converted = await images.fetchSocialPoster(posterUrl, project, async () => new Response(bytes, { headers: { "Content-Type": "image/png" } }));
    const png = Buffer.from(converted.split(",")[1], "base64");
    const corner = await sharp(png).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(corner[0] > 235 && corner[1] > 235 && corner[2] > 230, "unfilled edges use the branded background");
  }
});

test("untrusted, oversized, invalid and unavailable image responses safely fall back", async () => {
  let called = false;
  assert.equal(await images.fetchSocialPoster("https://attacker.example.test/private", project, async () => { called = true; }), null);
  assert.equal(called, false);
  const invalid = [
    () => new Response("missing", { status: 404 }),
    () => new Response("<svg></svg>", { headers: { "Content-Type": "image/svg+xml" } }),
    () => new Response("invalid", { headers: { "Content-Type": "image/png" } }),
    () => new Response("small", { headers: { "Content-Type": "image/png", "Content-Length": String(5 * 1024 * 1024 + 1) } }),
    () => { throw new Error("timeout/redirect blocked"); },
  ];
  for (const response of invalid) assert.equal(await images.fetchSocialPoster(posterUrl, project, async () => response()), null);
  let cancelled = false;
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); controller.enqueue(new Uint8Array(3 * 1024 * 1024)); }, cancel() { cancelled = true; } });
  assert.equal(await images.fetchSocialPoster(posterUrl, project, async () => new Response(oversized, { headers: { "Content-Type": "image/png" } })), null);
  assert.equal(cancelled, true, "streamed bytes stop at the size limit even without Content-Length");
});

test("decompression pixel budget rejects enormous dimensions before decoding the poster", async () => {
  const header = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).png().toBuffer();
  header.writeUInt32BE(6000, 16); header.writeUInt32BE(5000, 20);
  let checksum = 0xffffffff;
  for (const byte of header.subarray(12, 29)) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  header.writeUInt32BE((checksum ^ 0xffffffff) >>> 0, 29);
  assert.equal(await images.fetchSocialPoster(posterUrl, project, async () => new Response(header, { headers: { "Content-Type": "image/png" } })), null);
});

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale}: the share artwork contains localized plain text and the Italian schedule`, () => {
    const element = images.eventSocialImageElement(event, locale, { poster: "data:image/png;base64,test", logo: null });
    const document = JSDOM.fragment(renderToStaticMarkup(element));
    assert.ok(document.textContent.includes(event.titolo[locale]));
    assert.ok(document.textContent.includes("19 dicembre 2026 · 13:30"));
    assert.ok(document.textContent.includes(event.location));
    assert.ok(document.textContent.includes(metadata.eventSocialCopy(event, locale).description));
    assert.equal(document.querySelectorAll("strong,script").length, 0);
    assert.equal(document.querySelector("img").getAttribute("width"), "440");
    assert.equal(document.querySelector("img").getAttribute("height"), "550");
    assert.match(document.querySelector("img").getAttribute("style"), /object-fit:contain/);
  });
}

test("missing poster/logo and accented European characters render a real 1200×630 PNG using only bundled fonts", async () => {
  const calls = [];
  const helper = load("src/lib/events/social-image.tsx", { "./social-metadata": metadata, "node:fs/promises": { readFile: async () => { throw new Error("unavailable logo"); } } }, { fetch: async (...args) => { calls.push(args); throw new Error("No network allowed in test"); } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    if (String(args[0]).startsWith("data:")) return originalFetch(...args);
    calls.push(args); throw new Error("OG rendering cannot fetch external fonts or emoji in unit tests");
  };
  try {
    for (const locale of ["it", "en", "de", "es"]) {
      const response = await helper.createEventSocialImage({ ...event, copertina_url: null, titolo: { [locale]: "Meraki: à è ì ò ù – Ä Ö Ü ß – á é í ó ú ñ ¡Bienvenidos!" } }, locale, project);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=3600");
      const png = Buffer.from(await response.arrayBuffer());
      const size = await sharp(png).metadata(); assert.equal(size.width, 1200); assert.equal(size.height, 630);
      assert.ok(png.length > 15_000, "the output includes rendered text rather than an empty canvas");
    }
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls.length, 0);
});

test("long titles and descriptions have bounded lengths and emoji never request CDN glyphs", () => {
  assert.equal(images.socialImageText("Ciao 🎉 🇮🇹 Meraki ♥️", 100), "Ciao Meraki");
  assert.equal(Array.from(images.socialImageText("à".repeat(150), 100)).length, 100);
  assert.ok(images.socialImageText("a".repeat(150), 100).endsWith("…"));
  const text = JSDOM.fragment(renderToStaticMarkup(images.eventSocialImageElement({ ...event, titolo: "a".repeat(200), descrizione: "b".repeat(400) }, "it", { poster: null, logo: null }))).textContent;
  assert.equal(text.includes("a".repeat(101)), false); assert.equal(text.includes("b".repeat(161)), false);
});

function apiFixture({ data = event, error = null, env = {} } = {}) {
  const calls = [], previews = [];
  const query = { select(columns) { calls.push(["select", columns]); return this; }, eq(name, value) { calls.push(["eq", name, value]); return this; }, maybeSingle: async () => ({ data, error }) };
  const route = load("src/app/api/social/event/[id]/route.ts", {
    "@supabase/supabase-js": { createClient: (...args) => { calls.push(["client", ...args]); return { from: table => { calls.push(["from", table]); return query; } }; } },
    "@/lib/events/social-image": { createEventSocialImage: async (...args) => { previews.push(args); return new Response("PNG fixture", { headers: { "Content-Type": "image/png" } }); } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: project, NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key", SUPABASE_SERVICE_ROLE_KEY: "must-never-be-used", ...env } } });
  return { route, calls, previews };
}
const requestPreview = (fixture, id = event.id, query = "") => fixture.route.GET(new Request(`https://www.merakiexperience.org/api/social/event/${id}${query}`), { params: Promise.resolve({ id }) });

test("public preview lookup is anonymous, explicitly published and limited to public event fields", async () => {
  const fixture = apiFixture();
  const response = await requestPreview(fixture, event.id, "?lang=es&v=cache-bust");
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png");
  const client = fixture.calls.find(([kind]) => kind === "client");
  assert.equal(client[1], project); assert.equal(client[2], "public-anon-key");
  assert.equal(client[3].auth.persistSession, false); assert.equal(client[3].auth.autoRefreshToken, false); assert.equal(client[3].auth.detectSessionInUrl, false);
  assert.deepEqual(fixture.calls.filter(([kind]) => kind === "eq"), [["eq", "id", event.id], ["eq", "attivo", true]]);
  assert.equal(fixture.calls.find(([kind]) => kind === "from")[1], "events");
  assert.equal(fixture.calls.find(([kind]) => kind === "select")[1], "id,slug,tipo,titolo,sottotitolo,descrizione,meta_title,meta_description,data_inizio,data_fine,copertina_url,location,updated_at");
  assert.equal(fixture.previews[0][1], "es"); assert.equal(fixture.previews[0][2], project);
});

test("draft, missing, invalid and unavailable previews share a non-cacheable 404 without data leakage", async () => {
  for (const options of [{ data: null }, { error: { message: "private database error" } }, { env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: "" } }]) {
    const fixture = apiFixture(options);
    const response = await requestPreview(fixture);
    assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "Event preview unavailable"); assert.equal(fixture.previews.length, 0);
  }
  const invalid = apiFixture(); assert.equal((await requestPreview(invalid, "not-a-uuid")).status, 404); assert.equal(invalid.calls.length, 0);
  const locale = apiFixture(); await requestPreview(locale, event.id, "?lang=%22%3Ebad&v=ignored"); assert.equal(locale.previews[0][1], "it");
});
