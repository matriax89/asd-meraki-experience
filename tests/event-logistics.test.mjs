import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => id in mocks ? mocks[id] : require(id), Date, Error });
  return compiledModule.exports;
}
const logistics = load("lib/events/logistics.ts");
const commerce = load("lib/commerce/config.ts");
const { eventLogisticsSchema, parseEventLogistics, emptyEventLogistics, logisticsText, hasEventLogistics } = logistics;
const text = (it = "", en = "", de = "", es = "") => ({ it, en, de, es });
const hotel = (id = "hotel-1") => ({ id, kind: "partner", name: "Hotel di esempio", address: "Via Esempio 1", mapUrl: "https://maps.example.test/hotel", bookingUrl: "https://hotel.example.test/prenota", phone: "+39 000 000000", email: "info@hotel.example.test", distance: text("10 minuti a piedi"), rate: text("Tariffa da confermare"), benefits: text("Colazione inclusa"), bookingInstructions: text("Indica il codice dell’evento"), validUntil: "2026-12-01" });
const route = (id = "plane-1") => ({ id, mode: "plane", title: text("Aeroporto principale", "Main airport"), description: text("Prosegui con il bus."), linkUrl: "https://transport.example.test/orari" });
const complete = () => ({ ...emptyEventLogistics(), accommodations: [hotel()], arrivals: [route()], accessibility: text("Ingresso accessibile"), contact: text("Contatta l’organizzazione") });

test("legacy absence and optional empty logistics remain valid without inventing content", () => {
  for (const value of [undefined, null, "", [], {}, { version: 2 }, { version: 1, accommodations: null }]) assert.equal(parseEventLogistics(value), null);
  assert.equal(eventLogisticsSchema.safeParse(null).success, true);
  assert.equal(eventLogisticsSchema.safeParse(emptyEventLogistics()).success, true);
  assert.equal(hasEventLogistics(null), false);
  assert.equal(hasEventLogistics(emptyEventLogistics()), false);
  const first = emptyEventLogistics(); const second = emptyEventLogistics();
  first.accommodations.push(hotel()); first.accessibility.it = "Prima copia";
  assert.equal(second.accommodations.length, 0);
  assert.equal(second.accessibility.it, "");
});

test("structured logistics distinguishes partner and suggested hotels and supports every arrival mode", () => {
  const value = complete();
  value.accommodations.push({ ...hotel("hotel-2"), kind: "suggested", name: "Struttura consigliata", validUntil: null });
  value.arrivals = ["plane", "train", "bus", "car"].map((mode) => ({ ...route(mode), mode }));
  const parsed = parseEventLogistics(value);
  assert.equal(parsed.accommodations[0].kind, "partner");
  assert.equal(parsed.accommodations[1].kind, "suggested");
  assert.equal(parsed.arrivals.length, 4);
  assert.equal(hasEventLogistics(parsed), true);
  assert.equal(hasEventLogistics({ ...emptyEventLogistics(), contact: text("", "Contact us") }), true);
});

test("fallback text uses the requested language, then Italian, then English, preserving plain text", () => {
  assert.equal(logisticsText(text("Italia", "English", "Deutsch", "Español"), "de-DE"), "Deutsch");
  assert.equal(logisticsText(text(" Italia ", "English", " "), "de"), "Italia");
  assert.equal(logisticsText(text("", "English"), "fr"), "English");
  assert.equal(logisticsText(text("Italiano", "English"), "constructor"), "Italiano");
  assert.equal(logisticsText(null, "it"), "");
  const value = complete(); value.accessibility.it = '<strong>Ingresso</strong><script>alert("x")</script>';
  assert.equal(parseEventLogistics(value).accessibility.it, value.accessibility.it, "data stays plain text for React escaping, never interpreted HTML");
});

test("localized presence hides empty public sections while the editor retains translations in other languages", () => {
  const value = { ...emptyEventLogistics(), contact: text("", "", "Kontakt"), accessibility: text("", "", "", "Accesible") };
  assert.equal(hasEventLogistics(value), true, "the admin still recognizes content in any language");
  assert.equal(hasEventLogistics(value, "it"), false);
  assert.equal(hasEventLogistics(value, "en"), false);
  assert.equal(hasEventLogistics(value, "de"), true);
  assert.equal(hasEventLogistics(value, "es"), true);
  value.contact.en = "Contact us";
  assert.equal(hasEventLogistics(value, "it"), true, "the English fallback is visible");
  value.contact.en = ""; value.accessibility.it = "Accessibile";
  assert.equal(hasEventLogistics(value, "fr"), true, "unknown locales can use Italian fallback");
  value.accessibility.it = ""; value.arrivals = [route()];
  assert.equal(hasEventLogistics(value, "it"), true, "arrival titles always have their Italian fallback");
  value.arrivals = []; value.accommodations = [hotel()];
  assert.equal(hasEventLogistics(value, "it"), true, "the structure name is not language-dependent");
});

test("link protocols and email are validated before any public rendering", () => {
  for (const link of ["javascript:alert(1)", "data:text/html,x", "mailto:guest@example.test", "//example.test", "/relative", "ftp://example.test"]) {
    for (const field of ["mapUrl", "bookingUrl"]) {
      const value = complete(); value.accommodations[0][field] = link;
      assert.equal(eventLogisticsSchema.safeParse(value).success, false, `${field}: ${link}`);
    }
    const value = complete(); value.arrivals[0].linkUrl = link;
    assert.equal(eventLogisticsSchema.safeParse(value).success, false, link);
  }
  const value = complete(); value.accommodations[0].email = "invalid-address";
  assert.equal(eventLogisticsSchema.safeParse(value).success, false);
  value.accommodations[0] = { ...hotel(), email: "", mapUrl: "", bookingUrl: "" }; value.arrivals[0].linkUrl = "";
  assert.equal(eventLogisticsSchema.safeParse(value).success, true, "optional links and email may be empty");
});

test("new rows require hotel names and Italian arrival titles; IDs and date-only validity are unambiguous", () => {
  for (const patch of [{ name: " " }, { validUntil: "2026-02-30" }, { validUntil: "01/12/2026" }, { validUntil: "2026-12-01T00:00:00Z" }, { kind: "sponsored" }]) {
    const value = complete(); Object.assign(value.accommodations[0], patch);
    assert.equal(eventLogisticsSchema.safeParse(value).success, false);
  }
  const value = complete(); value.arrivals[0].title = text("", "English only");
  assert.equal(eventLogisticsSchema.safeParse(value).success, false);
  value.arrivals[0] = route(); value.arrivals.push(route());
  assert.equal(eventLogisticsSchema.safeParse(value).success, false, "duplicate route IDs are rejected");
  value.arrivals = []; value.accommodations.push(hotel());
  assert.equal(eventLogisticsSchema.safeParse(value).success, false, "duplicate hotel IDs are rejected");
});

test("bounded arrays, fields and strict objects reject oversized or unknown data", () => {
  const tooManyHotels = { ...emptyEventLogistics(), accommodations: Array.from({ length: 13 }, (_, index) => hotel(`hotel-${index}`)) };
  const tooManyRoutes = { ...emptyEventLogistics(), arrivals: Array.from({ length: 17 }, (_, index) => route(`route-${index}`)) };
  assert.equal(eventLogisticsSchema.safeParse(tooManyHotels).success, false);
  assert.equal(eventLogisticsSchema.safeParse(tooManyRoutes).success, false);
  const value = complete(); value.arrivals[0].description.it = "x".repeat(4001);
  assert.equal(eventLogisticsSchema.safeParse(value).success, false);
  assert.equal(eventLogisticsSchema.safeParse({ ...complete(), unknown: "extra" }).success, false);
  assert.equal(eventLogisticsSchema.safeParse({ ...complete(), accessibility: { ...text(), fr: "extra" } }).success, false);
});

const eventId = "12345678-1111-4111-8111-123456789abc";
const baseEvent = { id: eventId, titolo: { it: "Evento" }, tipo: "evento", data_inizio: "2027-08-01T08:00:00Z", attivo: false };
function serverFixture(authorized = true) {
  const saved = [];
  const db = { from(table) {
    assert.equal(table, "events"); let payload;
    return { upsert(value) { payload = value; saved.push(value); return this; }, select() { return this; }, async single() { return { data: { ...payload, id: eventId }, error: null }; } };
  } };
  const actions = load("app/api/admin/eventi/actions.ts", {
    "@/lib/events/logistics": logistics, "@/lib/commerce/config": commerce,
    "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => { if (!authorized) throw new Error("Accesso negato"); return db; } },
    "next/cache": { revalidatePath() {} },
  });
  return { actions, saved };
}

test("the staff action persists validated logistics, preserves omitted legacy fields, and permits explicit removal", async () => {
  const fixture = serverFixture();
  assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, logistics: complete() })).success, true);
  assert.equal(fixture.saved[0].logistics.accommodations[0].name, "Hotel di esempio");
  assert.equal((await fixture.actions.upsertEvent(baseEvent)).success, true);
  assert.equal("logistics" in fixture.saved[1], false, "omission does not overwrite existing travel information");
  assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, logistics: null })).success, true);
  assert.equal(fixture.saved[2].logistics, null);
});

test("invalid travel data and unauthorized callers cannot cause an event write", async () => {
  const fixture = serverFixture(); const value = complete(); value.accommodations[0].bookingUrl = "javascript:alert(1)";
  const rejected = await fixture.actions.upsertEvent({ ...baseEvent, logistics: value });
  assert.equal(rejected.success, false); assert.match(rejected.error, /Viaggio e soggiorno/);
  assert.equal(fixture.saved.length, 0);
  const unauthorized = serverFixture(false);
  await assert.rejects(unauthorized.actions.upsertEvent({ ...baseEvent, logistics: complete() }), /Accesso negato/);
  assert.equal(unauthorized.saved.length, 0);
});
