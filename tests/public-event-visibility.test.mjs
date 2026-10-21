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
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, URL, require: (name) => name in mocks ? mocks[name] : require(name), Date, Intl });
  return compiledModule.exports;
}
const i18n = load("lib/i18n-utils.ts");
const richText = load("lib/rich-text.ts");
const socialMetadata = load("lib/events/social-metadata.ts", { "@/lib/i18n-utils": i18n, "@/lib/rich-text": richText });
const eventsData = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": i18n });
const logistics = load("lib/events/logistics.ts", { "@/lib/rich-text": richText });
const affiliates = load("lib/events/affiliates.ts");
const commerceConfig = load("lib/commerce/config.ts");
const travelData = { ...logistics.emptyEventLogistics(), contact: { it: "Assistenza viaggio Meraki", en: "", de: "", es: "" } };

function fixture(type, published, withSchedule = true) {
  const queries = [];
  const selections = [];
  const row = { id: "local-event", slug: "private-draft-slug", tipo: type, attivo: published, titolo: { it: "Titolo riservato della bozza", en: "Private draft title" }, descrizione: { it: "Descrizione riservata della bozza" }, copertina_url: "https://example.test/private-draft-image.png", data_inizio: "2027-01-01T10:00:00Z", data_fine: null, check_in_starts_at: "2026-12-31T17:00:00Z", sottotitolo: null, location: null, indirizzo: null, prezzo_cents: 3000, capacity: 20, posti_venduti: 0, cta_tipo: "stripe", cta_url: null };
  row.logistics = travelData;
  row.commerce_config = withSchedule ? { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true,
    activities: [{ id: "workshop", name: "Workshop", kind: "workshop", capacity: 20, startsAt: row.data_inizio, checkInStartsAt: "2027-01-01T09:30:00Z", endsAt: "2027-01-01T12:00:00Z", salesEnd: null, menuOptions: [] }],
    packages: [{ id: "workshop", name: "Workshop", description: "", activityIds: ["workshop"], prices: [{ id: "standard", label: "Standard", amountCents: 3000, startsAt: null, endsAt: null }] }], addons: [] } : null;
  row.affiliates = [
    { id: "10000000-0000-4000-8000-000000000001", name: "Referente attivo", active: true },
    { id: "10000000-0000-4000-8000-000000000002", name: "Referente disattivato", active: false },
  ];
  const client = { from(table) {
    assert.equal(table, "events");
    const predicates = [];
    const query = { select(columns) { selections.push(columns); return this; }, eq(column, value) { predicates.push((entry) => entry[column] === value); queries.push([column, value]); return this; }, in(column, values) { predicates.push((entry) => values.includes(entry[column])); return this; }, not(column, operator, value) { assert.equal(operator, "is"); assert.equal(value, null); predicates.push((entry) => entry[column] != null); return this; }, async single() { return { data: predicates.every((predicate) => predicate(row)) ? row : null, error: null }; }, async maybeSingle() { return this.single(); } };
    return query;
  } };
  const server = { createClient: async () => client, createAdminClient: () => client };
  const socialData = load("lib/events/social-data.ts", { react: { cache: callback => callback }, "@/lib/supabase/server": server });
  const page = load(`app/[locale]/(public)/${type === "evento" ? "eventi" : "workshop"}/[slug]/page.tsx`, {
    "@/lib/supabase/server": server,
    "@/lib/events/social-data": socialData,
    "@/lib/events/canceled-public-event": load("lib/events/canceled-public-event.ts", { "server-only": {}, "@/lib/supabase/server": server }),
    "@/lib/events/cancellation-copy": load("lib/events/cancellation-copy.ts"),
    "@/components/meraki/canceled-event": { CanceledEvent: () => null },
    "@/lib/events/social-metadata": socialMetadata,
    "@/lib/i18n-utils": i18n,
    "@/components/meraki/events-data": eventsData,
    "@/components/meraki/event-detail": { EventDetail: () => null },
    "@/lib/events/logistics": logistics,
    "@/lib/events/affiliates": affiliates,
    "@/lib/commerce/config": commerceConfig,
    "@/lib/rich-text": richText,
    "next/navigation": { notFound() { throw Object.assign(new Error("Not found"), { status: 404 }); } },
  });
  return { page, queries, selections, params: Promise.resolve({ locale: "it", slug: row.slug }) };
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
    assert.equal(element.props.event.checkInStartsAt, "2026-12-31T17:00:00Z");
    assert.ok(current.selections[0].split(",").map((column) => column.trim()).includes("check_in_starts_at"));
    assert.ok(current.selections[0].split(",").map((column) => column.trim()).includes("logistics"));
    assert.equal(element.props.event.logistics.contact.it, "Assistenza viaggio Meraki");
    assert.deepEqual(JSON.parse(JSON.stringify(element.props.event.affiliates)), [{ id: "10000000-0000-4000-8000-000000000001", name: "Referente attivo" }]);
    assert.ok(current.selections[0].split(",").map((column) => column.trim()).includes("affiliates"));
    assert.ok(current.selections[0].split(",").map((column) => column.trim()).includes("commerce_config"));
    assert.equal(element.props.event.activities[0].checkInStartsAt, "2027-01-01T09:30:00Z");
    assert.equal(element.props.event.activities[0].endsAt, "2027-01-01T12:00:00Z");
    const metadata = await current.page.generateMetadata({ params: current.params });
    assert.equal(metadata.title, "Titolo riservato della bozza");
    assert.equal(metadata.openGraph.images[0].url, "https://example.test/private-draft-image.png");
    assert.equal(metadata.openGraph.images[0].width, undefined);
    assert.equal(metadata.openGraph.images[0].height, undefined);
    assert.equal(metadata.openGraph.images[0].alt, "Titolo riservato della bozza");
  });
}

test("a legacy event without activity configuration retains the general event schedule", async () => {
  const current = fixture("evento", true, false);
  const element = await current.page.default({ params: current.params });
  assert.equal(element.props.event.activities, undefined);
  assert.equal(element.props.event.checkInStartsAt, "2026-12-31T17:00:00Z");
});
