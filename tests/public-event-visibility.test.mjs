import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : require(name), Date, Intl });
  return compiledModule.exports;
}
const i18n = load("lib/i18n-utils.ts");
const eventsData = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": i18n });

function fixture(type, published) {
  const queries = [];
  const row = { id: "local-event", slug: "private-draft-slug", tipo: type, attivo: published, titolo: { it: "Titolo riservato della bozza", en: "Private draft title" }, descrizione: { it: "Descrizione riservata della bozza" }, copertina_url: "https://example.test/private-draft-image.png", data_inizio: "2027-01-01T10:00:00Z", data_fine: null, sottotitolo: null, location: null, indirizzo: null, prezzo_cents: 3000, capacity: 20, posti_venduti: 0, cta_tipo: "stripe", cta_url: null };
  const server = { createClient: async () => ({ from(table) {
    assert.equal(table, "events");
    const predicates = [];
    const query = { select() { return this; }, eq(column, value) { predicates.push((entry) => entry[column] === value); queries.push([column, value]); return this; }, in(column, values) { predicates.push((entry) => values.includes(entry[column])); return this; }, async single() { return { data: predicates.every((predicate) => predicate(row)) ? row : null, error: null }; } };
    return query;
  } }) };
  const page = load(`app/[locale]/(public)/${type === "evento" ? "eventi" : "workshop"}/[slug]/page.tsx`, {
    "@/lib/supabase/server": server,
    "@/lib/i18n-utils": i18n,
    "@/components/meraki/events-data": eventsData,
    "@/components/meraki/event-detail": { EventDetail: () => null },
    "next/navigation": { notFound() { throw Object.assign(new Error("Not found"), { status: 404 }); } },
  });
  return { page, queries, params: Promise.resolve({ locale: "it", slug: row.slug }) };
}

for (const type of ["evento", "workshop", "masterclass"]) {
  test(`a known ${type} draft slug never renders public event content or private metadata`, async () => {
    const current = fixture(type, false);
    await assert.rejects(current.page.default({ params: current.params }), (error) => error.status === 404);
    const metadata = await current.page.generateMetadata({ params: current.params });
    assert.equal(metadata.title, "Evento non trovato");
    assert.equal(metadata.description, undefined);
    assert.equal(metadata.openGraph, undefined);
    assert.equal(current.queries.filter(([column, value]) => column === "attivo" && value === true).length, 2);
  });

  test(`a published ${type} remains accessible with its genuine public metadata`, async () => {
    const current = fixture(type, true);
    const element = await current.page.default({ params: current.params });
    assert.equal(element.props.event.title, "Titolo riservato della bozza");
    const metadata = await current.page.generateMetadata({ params: current.params });
    assert.equal(metadata.title, "Titolo riservato della bozza");
    assert.equal(metadata.openGraph.images[0].url, "https://example.test/private-draft-image.png");
  });
}
