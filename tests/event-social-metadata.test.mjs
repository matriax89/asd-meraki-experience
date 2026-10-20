import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sourceRoot = new URL("../src/", import.meta.url);
function load(path, mocks = {}, env = {}) {
  const cache = new Map();
  function evaluate(file) {
    if (cache.has(file)) return cache.get(file);
    const exported = {};
    cache.set(file, exported);
    const compiled = ts.transpileModule(readFileSync(new URL(file, sourceRoot), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports: exported, URL, URLSearchParams, Date, Intl, console, Buffer, process: { env: { ...process.env, NEXT_PUBLIC_SITE_URL: "https://www.merakiexperience.org", ...env } }, require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return evaluate(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) return evaluate(new URL(`${name}.ts`, new URL(file, sourceRoot)).pathname.slice(sourceRoot.pathname.length));
      return require(name);
    } });
    return exported;
  }
  return evaluate(path);
}

const locales = ["it", "en", "de", "es"];
const titles = { it: "Evento Meraki", en: "Meraki event", de: "Meraki Veranstaltung", es: "Evento de Meraki" };
const descriptions = { it: "Balla e incontra nuove persone a Laives.", en: "Dance and meet new people in Laives.", de: "Tanze und lerne neue Menschen in Laives kennen.", es: "Baila y conoce a nuevas personas en Laives." };
const event = (overrides = {}) => ({
  id: "30da43c2-3ee7-4e7d-97b4-28c789e366de", slug: "vibra-by-alejandro-angulo", tipo: "evento", titolo: titles,
  sottotitolo: null, descrizione: Object.fromEntries(locales.map(locale => [locale, `<p>${descriptions[locale]}</p>`])),
  meta_title: null, meta_description: null, data_inizio: "2026-12-19T12:00:00Z", data_fine: null,
  copertina_url: "https://assets.example.test/poster-originale.jpg", location: "Black Box, Laives", updated_at: "2026-10-20T19:00:00Z", ...overrides,
});

const social = load("lib/events/social-metadata.ts");
for (const locale of locales) test(`${locale}: social copy uses the event's localized public content without editor markup`, () => {
  const copy = social.eventSocialCopy(event(), locale);
  assert.equal(copy.title, titles[locale]);
  assert.ok(copy.description.includes(descriptions[locale]));
  assert.doesNotMatch(copy.description, /<\/?p>/);
  assert.ok(copy.description.length <= 240, "a bounded description remains suitable for link previews");
});

test("shared copy uses localized custom SEO copy and cleans hidden HTML, whitespace and entities", () => {
  const copy = social.eventSocialCopy(event({
    meta_title: { it: "<b>Meraki &amp; amici</b>", en: "<b>Meraki &amp; friends</b>" },
    meta_description: { it: "<p>Una giornata&nbsp; insieme.</p><script>segreto()</script>", en: "<p>A day&nbsp; together.</p><style>private rule</style>" },
  }), "en");
  assert.equal(copy.title, "Meraki & friends");
  assert.ok(copy.description.includes("A day together."));
  assert.doesNotMatch(copy.description, /<|>|&nbsp;|script|segreto|private rule/);
});

test("missing locale content falls back to the existing Italian event copy", () => {
  const copy = social.eventSocialCopy(event({ titolo: { it: "Titolo originale" }, descrizione: { it: "<p>Descrizione originale.</p>" } }), "de");
  assert.equal(copy.title, "Titolo originale");
  assert.ok(copy.description.includes("Descrizione originale."));
});

test("an event without a description still has a useful public preview", () => {
  for (const locale of locales) {
    const copy = social.eventSocialCopy(event({ descrizione: null, meta_description: null, sottotitolo: null }), locale);
    assert.ok(copy.description.trim());
    assert.ok(copy.description.includes(titles[locale]) || copy.description.includes("Laives"), "fallback describes this event rather than unrelated brand copy");
    assert.doesNotMatch(copy.description, /undefined|null|Invalid Date/);
  }
});

for (const locale of locales) test(`${locale}: Open Graph and Twitter expose one public, versioned landscape image and matching event copy`, () => {
  const current = event();
  const metadata = social.eventSocialMetadata(current, locale, `/${locale}/eventi/${current.slug}`);
  assert.equal(metadata.title, titles[locale]);
  assert.equal(metadata.openGraph.title, titles[locale]);
  assert.equal(metadata.twitter.title, titles[locale]);
  assert.equal(metadata.description, metadata.openGraph.description);
  assert.equal(metadata.twitter.description, metadata.openGraph.description);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.ok(metadata.openGraph.siteName.includes("Meraki"));
  assert.equal(metadata.openGraph.type, "website");
  const og = metadata.openGraph.images[0];
  assert.equal(og.width, 1200);
  assert.equal(og.height, 630);
  assert.equal(og.alt, titles[locale]);
  const image = new URL(String(og.url));
  assert.equal(image.protocol, "https:");
  assert.equal(image.origin, "https://www.merakiexperience.org");
  assert.equal(image.pathname, `/api/social/event/${current.id}`);
  assert.equal(image.searchParams.get("lang"), locale);
  assert.equal(image.searchParams.get("v"), current.updated_at);
  const twitterImage = metadata.twitter.images[0];
  assert.equal(String(typeof twitterImage === "string" || twitterImage instanceof URL ? twitterImage : twitterImage.url), String(og.url));
  assert.equal(String(metadata.alternates.canonical), `https://www.merakiexperience.org/${locale}/eventi/${current.slug}`);
  assert.equal(String(metadata.openGraph.url), String(metadata.alternates.canonical));
});

test("canonical social URLs never include checkout tokens, affiliate tracking or page anchors", () => {
  const metadata = social.eventSocialMetadata(event(), "it", "/it/eventi/vibra-by-alejandro-angulo?affiliate=referente&token=private-token&checkout=private-session#prezzi");
  assert.equal(String(metadata.alternates.canonical), "https://www.merakiexperience.org/it/eventi/vibra-by-alejandro-angulo");
  assert.equal(String(metadata.openGraph.url), String(metadata.alternates.canonical));
  assert.doesNotMatch(JSON.stringify(metadata), /private-token|private-session|affiliate=|#prezzi/);
});

test("changing a poster or event's revision invalidates the public preview image URL", () => {
  const before = social.eventSocialMetadata(event(), "it", "/it/eventi/vibra-by-alejandro-angulo");
  const after = social.eventSocialMetadata(event({ updated_at: "2026-10-21T10:10:00Z", copertina_url: "https://assets.example.test/nuova-locandina.png" }), "it", "/it/eventi/vibra-by-alejandro-angulo");
  assert.notEqual(String(before.openGraph.images[0].url), String(after.openGraph.images[0].url));
});

test("long descriptions preserve emoji and stop at a word boundary with a visible ellipsis", () => {
  const text = `🔥 ${"Una descrizione completa e leggibile per ogni persona. ".repeat(12)}`;
  const copy = social.eventSocialCopy(event({ descrizione: { it: `<p>${text}</p>` } }), "it");
  assert.ok(Array.from(copy.description).length <= 180);
  assert.ok(copy.description.endsWith("…"));
  assert.equal(Array.from(copy.description)[0], "🔥");
  assert.equal(copy.description.includes("\uFFFD"), false);
  const visible = copy.description.slice(0, -1);
  assert.ok(text.startsWith(visible));
  assert.match(text.slice(visible.length), /^\s/);
});

test("locale prefixes are replaced correctly in canonical and alternate-language URLs", () => {
  const metadata = social.eventSocialMetadata(event(), "de", "/it/eventi/vibra-by-alejandro-angulo?utm_source=whatsapp#top");
  assert.equal(String(metadata.alternates.canonical), "https://www.merakiexperience.org/de/eventi/vibra-by-alejandro-angulo");
  for (const locale of locales) assert.equal(String(metadata.alternates.languages[locale]), `https://www.merakiexperience.org/${locale}/eventi/vibra-by-alejandro-angulo`);
  assert.equal(metadata.openGraph.locale, "de_DE");
  assert.equal(metadata.openGraph.alternateLocale.length, 3);
});

test("global brand defaults never force the homepage canonical onto unrelated child pages", () => {
  const metadata = social.brandSocialMetadata("es");
  assert.equal(metadata.alternates, undefined);
  assert.equal(metadata.openGraph.url, undefined);
  assert.equal(metadata.openGraph.locale, "es_ES");
  assert.ok(metadata.description.includes("Eventos"));
  assert.equal(metadata.openGraph.images[0].type, "image/png");
});
