import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createTranslator } from "next-intl";

const require = createRequire(import.meta.url);
const sourceRoot = new URL("../src/", import.meta.url);
const instant = "2026-10-20T20:00:00.000Z";
class SnapshotDate extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return Date.parse(instant); }
}
const locales = ["it", "en", "de", "es"];
const row = (overrides = {}) => ({
  id: "30da43c2-3ee7-4e7d-97b4-28c789e366de", slug: "evento-pubblico", tipo: "evento", attivo: true,
  titolo: { it: "Evento pubblico", en: "Public event", de: "Öffentliches Event", es: "Evento público" },
  sottotitolo: null, descrizione: { it: "<p>Un evento per ballare insieme.</p>", en: "<p>An event to dance together.</p>", de: "<p>Ein Event zum gemeinsamen Tanzen.</p>", es: "<p>Un evento para bailar juntos.</p>" },
  meta_title: null, meta_description: null, data_inizio: "2026-12-19T12:00:00Z", data_fine: null,
  copertina_url: "https://assets.example.test/locandina.jpg", location: "Black Box, Laives", updated_at: "2026-10-20T19:00:00Z", ...overrides,
});
function fixture(rows, error = null) {
  const requests = [];
  const supabase = { from(table) {
    const record = { table, columns: null, filters: [], orders: [] };
    requests.push(record);
    let limit = Infinity;
    const predicates = [];
    const query = {
      select(columns) { record.columns = columns; return this; },
      eq(column, value) { record.filters.push(["eq", column, value]); predicates.push(entry => entry[column] === value); return this; },
      in(column, values) { record.filters.push(["in", column, values]); predicates.push(entry => values.includes(entry[column])); return this; },
      order(column, options) { record.orders.push([column, options]); return this; },
      limit(value) { limit = value; return this; },
      result(single = false) {
        const values = table === "events" ? rows.filter(entry => predicates.every(predicate => predicate(entry))) : [];
        for (const [column, options] of [...record.orders].reverse()) values.sort((a, b) => (String(a[column]).localeCompare(String(b[column]))) * (options?.ascending === false ? -1 : 1));
        const data = values.slice(0, limit);
        return { data: error ? null : single ? data[0] || null : table === "site_settings" ? null : data, error };
      },
      async single() { return this.result(true); },
      async maybeSingle() { return this.result(true); },
      then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
    };
    return query;
  } };
  const modules = new Map();
  const server = { createClient: async () => supabase };
  const emptyUi = new Proxy({}, { get: () => () => null });
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exported = {};
    modules.set(file, exported);
    const compiled = ts.transpileModule(readFileSync(new URL(file, sourceRoot), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports: exported, URL, URLSearchParams, Date: SnapshotDate, Intl, Buffer, console, process: { env: { ...process.env, NEXT_PUBLIC_SITE_URL: "https://www.merakiexperience.org" } }, require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/server") return server;
      if (name === "react") return { ...require(name), cache: callback => callback };
      if (name === "next-intl/server") return { getTranslations: async ({ locale, namespace }) => createTranslator({ locale, namespace, messages: JSON.parse(readFileSync(new URL(`messages/${locale}.json`, sourceRoot), "utf8")) }) };
      if (name === "next/navigation") return { notFound() { throw Object.assign(new Error("Not found"), { status: 404 }); } };
      if (name === "@/lib/commerce/feed") return { enrichCommerceFeed: async events => events };
      if (name === "@/components/meraki/events-data" || name === "@/components/meraki/event-model") return load(`${name.slice(2)}.ts`);
      if (name === "@/i18n/routing" || name.startsWith("@/components/") || name === "./orario/schedule-client") return emptyUi;
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(new URL(`${name}.ts`, new URL(file, sourceRoot)).pathname.slice(sourceRoot.pathname.length));
      return require(name);
    } });
    return exported;
  }
  return { requests, load, async metadata(route, locale = "it", slug = "evento-pubblico") {
    return load(`app/[locale]/(public)/${route ? `${route}/` : ""}page.tsx`).generateMetadata({ params: Promise.resolve({ locale, slug }) });
  } };
}

test("featured social data chooses the first published future or ongoing event, excluding ended and inactive rows", async () => {
  const inactive = row({ id: "inactive", attivo: false, data_inizio: "2026-10-20T10:00:00Z" });
  const ended = row({ id: "ended", data_inizio: "2026-10-20T10:00:00Z", data_fine: instant });
  const archived = row({ id: "archived", data_inizio: "2026-08-01T10:00:00Z" });
  const ongoing = row({ id: "ongoing", data_inizio: "2026-10-20T19:00:00Z", data_fine: "2026-10-20T22:00:00Z" });
  const future = row({ id: "future", data_inizio: "2026-12-19T12:00:00Z" });
  const fixtureData = fixture([future, inactive, ended, archived, ongoing]);
  const actual = await fixtureData.load("lib/events/social-data.ts").getFeaturedSocialEvent();
  assert.equal(actual.id, "ongoing");
  assert.deepEqual(fixtureData.requests[0].filters, [["eq", "attivo", true]]);
  assert.equal(fixtureData.requests[0].orders[0][0], "data_inizio");
  assert.equal(fixtureData.requests[0].orders[0][1].ascending, true);
});

test("workshop social data excludes standard events and includes masterclasses", async () => {
  const current = fixture([row({ tipo: "evento", id: "regular", data_inizio: "2026-11-01T12:00:00Z" }), row({ tipo: "masterclass", id: "masterclass", data_inizio: "2026-12-01T12:00:00Z" }), row({ tipo: "workshop", id: "workshop", data_inizio: "2026-12-19T12:00:00Z" })]);
  const actual = await current.load("lib/events/social-data.ts").getFeaturedSocialEvent(["workshop", "masterclass"]);
  assert.equal(actual.id, "masterclass");
  assert.equal(current.requests[0].filters.some(([operation, column, values]) => operation === "in" && column === "tipo" && values.includes("workshop") && values.includes("masterclass")), true);
});

test("empty, archived-only and unavailable social catalogues do not promote an event", async () => {
  for (const [rows, error] of [[[], null], [[row({ data_inizio: instant })], null], [[row({ attivo: false })], null], [[row()], { code: "private-error", message: "Database unavailable" }]]) {
    const current = fixture(rows, error);
    assert.equal(await current.load("lib/events/social-data.ts").getFeaturedSocialEvent(), null);
  }
});

test("exact slug lookup cannot expose a draft or an event from another public route type", async () => {
  const rows = [row({ slug: "bozza", attivo: false }), row({ slug: "workshop", tipo: "workshop" }), row({ slug: "pubblicato" })];
  const current = fixture(rows);
  const { getSocialEvent } = current.load("lib/events/social-data.ts");
  assert.equal(await getSocialEvent("bozza", ["evento"]), null);
  assert.equal(await getSocialEvent("workshop", ["evento"]), null);
  assert.equal(await getSocialEvent("missing", ["evento"]), null);
  assert.equal((await getSocialEvent("pubblicato", ["evento"])).slug, "pubblicato");
  for (const request of current.requests) assert.ok(request.filters.some(([operation, column, value]) => operation === "eq" && column === "attivo" && value === true));
});

for (const locale of locales) test(`${locale}: homepage and event catalogue share the first visible event's title, description and poster`, async () => {
  const current = fixture([row({ id: "later", data_inizio: "2027-01-01T12:00:00Z" }), row({ id: "past", data_inizio: "2026-08-01T12:00:00Z" }), row()]);
  const home = await current.metadata("", locale);
  const catalogue = await current.metadata("eventi", locale);
  for (const metadata of [home, catalogue]) {
    assert.equal(metadata.openGraph.title, row().titolo[locale]);
    assert.equal(metadata.twitter.title, row().titolo[locale]);
    assert.ok(metadata.description.includes(row().descrizione[locale].replace(/<[^>]+>/g, "")));
    assert.equal(String(metadata.openGraph.images[0].url), row().copertina_url);
    assert.equal(metadata.openGraph.images[0].width, undefined);
    assert.equal(metadata.openGraph.images[0].height, undefined);
  }
  assert.equal(String(home.alternates.canonical), `https://www.merakiexperience.org/${locale}`);
  assert.equal(String(catalogue.alternates.canonical), `https://www.merakiexperience.org/${locale}/eventi`);
  assert.equal(String(home.openGraph.images[0].url), String(catalogue.openGraph.images[0].url));
});

for (const locale of locales) test(`${locale}: workshop listing and detail use the workshop's exact localized social metadata`, async () => {
  const workshop = row({ tipo: "workshop", slug: "workshop-pubblico" });
  const current = fixture([row({ id: "earlier-standard", data_inizio: "2026-11-01T12:00:00Z", titolo: { it: "Evento da escludere" } }), workshop]);
  for (const route of ["workshop", "workshop/[slug]"]) {
    const metadata = await current.metadata(route, locale, workshop.slug);
    assert.equal(metadata.openGraph.title, workshop.titolo[locale]);
    assert.equal(String(metadata.openGraph.images[0].url), workshop.copertina_url);
    const path = route.includes("[slug]") ? `/workshop/${workshop.slug}` : "/workshop";
    assert.equal(String(metadata.alternates.canonical), `https://www.merakiexperience.org/${locale}${path}`);
  }
});

for (const locale of locales) test(`${locale}: event detail describes the exact shared event even when another event is featured`, async () => {
  const shared = row({ id: "archived-published", data_inizio: "2026-08-01T12:00:00Z", slug: "evento-storico" });
  const current = fixture([row({ titolo: { it: "Altro evento" } }), shared]);
  const metadata = await current.metadata("eventi/[slug]", locale, shared.slug);
  assert.equal(metadata.openGraph.title, shared.titolo[locale]);
  assert.equal(String(metadata.openGraph.images[0].url), shared.copertina_url);
  assert.equal(String(metadata.alternates.canonical), `https://www.merakiexperience.org/${locale}/eventi/evento-storico`);
});

test("empty and failed catalogue metadata retains localized brand previews instead of a stale event", async () => {
  for (const locale of locales) for (const [rows, error] of [[[], null], [[row({ attivo: false, titolo: { it: "Bozza segreta" } })], null], [[row({ data_inizio: "2026-08-01T12:00:00Z", titolo: { it: "Evento archiviato" } })], null], [[row({ titolo: { it: "Errore privato" } })], { code: "unavailable" }]]) {
    for (const route of ["", "eventi", "workshop"]) {
      const metadata = await fixture(rows, error).metadata(route, locale);
      assert.ok(metadata.openGraph.title.includes("Meraki"));
      assert.ok(metadata.openGraph.description.trim());
      assert.ok(metadata.openGraph.images[0].url.endsWith("/images/logo-meraki-email.png"));
      assert.doesNotMatch(JSON.stringify(metadata), /Bozza segreta|Evento archiviato|Errore privato|\/api\/social\/event\//);
      assert.equal(String(metadata.alternates.canonical), `https://www.merakiexperience.org/${locale}${route ? `/${route}` : ""}`);
    }
  }
});

test("unpublished, missing and route-mismatched detail metadata never exposes private event content", async () => {
  for (const locale of locales) for (const route of ["eventi/[slug]", "workshop/[slug]"]) {
    const requestedType = route.startsWith("eventi") ? "evento" : "workshop";
    for (const rows of [[], [row({ tipo: requestedType, attivo: false, titolo: { it: "Bozza riservata" }, descrizione: { it: "Dettagli riservati" } })], [row({ tipo: requestedType === "evento" ? "workshop" : "evento", titolo: { it: "Tipo non ammesso" } })]]) {
      const metadata = await fixture(rows).metadata(route, locale);
      assert.doesNotMatch(JSON.stringify(metadata), /Bozza riservata|Dettagli riservati|Tipo non ammesso|locandina\.jpg|\/api\/social\/event\//);
      assert.equal(metadata.openGraph, undefined);
      assert.equal(metadata.description, undefined);
    }
  }
});
