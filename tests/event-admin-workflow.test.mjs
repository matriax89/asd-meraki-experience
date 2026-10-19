import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/de/admin/eventi/nuovo", pretendToBeVisual: true });
const original = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document, Event: dom.window.Event, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
after(() => { dom.window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => id in mocks ? mocks[id] : require(id), Date, Intl, Error, console: { error() {} } });
  return compiledModule.exports;
}
const config = load("lib/commerce/config.ts");
const rome = load("lib/commerce/rome-time.ts");
const customSelect = load("components/ui/custom-select.tsx", { "./custom-select.module.css": {} });
const elements = load("components/admin/form-elements.tsx", { "@/components/ui/custom-select": customSelect });
const i18n = load("lib/i18n-utils.ts");
const Anchor = ({ children, ...props }) => React.createElement("a", props, children);
const routing = { Link: Anchor };
const eventId = "12345678-1111-4111-8111-123456789abc";
const validConfig = { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [{ id: "ws", name: "Workshop", kind: "workshop", capacity: 20, startsAt: null, salesEnd: null, menuOptions: [] }], packages: [{ id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["ws"], prices: [{ id: "standard", label: "Standard", amountCents: 2000, startsAt: null, endsAt: null }] }], addons: [] };
const baseEvent = { id: eventId, titolo: { it: "Evento di prova" }, sottotitolo: null, descrizione: null, slug: "evento-di-prova", tipo: "evento", data_inizio: "2027-08-01T08:30:00.000Z", data_fine: "2027-08-01T10:30:00.000Z", check_in_starts_at: null, prezzo_cents: 3500, capacity: 0, location: "Bolzano", indirizzo: null, copertina_url: null, attivo: true, posti_venduti: 0 };

function serverFixture(existing = baseEvent) {
  const saved = [];
  const db = { from(table) {
    assert.equal(table, "events");
    let patch;
    return { select() { return this; }, eq() { return this; }, upsert(value) { patch = value; saved.push(value); return this; }, async single() { return { data: patch ? { ...patch, id: eventId } : existing, error: null }; } };
  } };
  const actions = load("app/api/admin/eventi/actions.ts", { "@/lib/commerce/config": config, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => db }, "next/cache": { revalidatePath() {} } });
  return { saved, actions };
}

test("advanced creation is always an unpublished draft and strips its transient mode from the database payload", async () => {
  const fixture = serverFixture();
  const newEvent = { ...baseEvent };
  delete newEvent.id;
  assert.equal((await fixture.actions.upsertEvent({ ...newEvent, ticketing_mode: "advanced", attivo: true })).success, true);
  assert.equal(fixture.saved[0].attivo, false);
  assert.equal(fixture.saved[0].prezzo_cents, null);
  assert.equal("ticketing_mode" in fixture.saved[0], false);
  assert.equal("commerce_config" in fixture.saved[0], false);
});

test("advanced details cannot publish an incomplete configuration, while legacy saves and enabled packages remain usable", async () => {
  const fixture = serverFixture();
  assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, ticketing_mode: "advanced" })).success, false);
  assert.equal(fixture.saved.length, 0);
  assert.equal((await fixture.actions.upsertEvent(baseEvent)).success, true);
  assert.equal(fixture.saved[0].prezzo_cents, 3500);
  assert.equal(fixture.saved[0].capacity, 0);
  const advanced = serverFixture({ ...baseEvent, commerce_config: validConfig });
  assert.equal((await advanced.actions.upsertEvent({ ...baseEvent, ticketing_mode: "advanced" })).success, true);
});

test("the server rejects an end before the start and accepts an equal end without persisting unwanted fields", async () => {
  const fixture = serverFixture();
  assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, data_fine: "2027-08-01T08:29:00Z" })).success, false);
  assert.equal(fixture.saved.length, 0);
  assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, data_fine: baseEvent.data_inizio })).success, true);
});

test("check-in opening is optional, accepts the previous day and compares absolute instants across offsets", async () => {
  for (const opening of [undefined, null, "2027-07-31T18:00:00+02:00", "2027-08-01T10:30:00+02:00"]) {
    const fixture = serverFixture();
    assert.equal((await fixture.actions.upsertEvent({ ...baseEvent, check_in_starts_at: opening })).success, true);
    assert.equal(fixture.saved[0].check_in_starts_at, opening);
  }
  const invalid = serverFixture();
  const result = await invalid.actions.upsertEvent({ ...baseEvent, check_in_starts_at: "2027-08-01T10:31:00+02:00" });
  assert.equal(result.success, false);
  assert.match(result.error, /apertura del check-in.*successiva/);
  assert.equal(invalid.saved.length, 0);
});

test("the server rejects a malformed or timezone-less check-in opening before any save", async () => {
  for (const opening of ["invalid", "2027-08-01T08:00", "2027-02-30T08:00:00Z", 123]) {
    const fixture = serverFixture();
    const result = await fixture.actions.upsertEvent({ ...baseEvent, check_in_starts_at: opening });
    assert.equal(result.success, false);
    assert.match(result.error, /data e orario dell’apertura check-in/);
    assert.equal(fixture.saved.length, 0);
  }
});

async function mount(context, initialData = null, result = { success: true, id: eventId }, initialTicketingMode, options = {}) {
  const saved = []; const navigations = []; const confirmations = []; const deleted = [];
  const dateTime = load("components/admin/date-time-field.tsx");
  const wizard = load("components/admin/wizard-steps.tsx");
  const { EventForm } = load("app/[locale]/admin/eventi/[id]/event-form.tsx", {
    "@/components/admin/form-elements": elements, "@/i18n/routing": routing,
    "@/components/admin/date-time-field": dateTime,
    "@/components/admin/wizard-steps": wizard,
    "@/lib/commerce/config": config, "@/lib/commerce/rome-time": rome,
    "next/navigation": { useRouter: () => ({ push: (url) => navigations.push(url) }) },
    "@/components/ui/modal-provider": { useModal: () => ({ showConfirm: async (value) => { confirmations.push(value); return Boolean(options.confirmDelete); } }) },
    "@/app/api/admin/eventi/actions": { upsertEvent: async (payload) => { saved.push(payload); return typeof result === "function" ? result(payload) : result; }, deleteEvent: async (id) => { deleted.push(id); return options.deleteResult || { success: true }; } },
  });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(EventForm, { initialData, locale: "de", initialTicketingMode })));
  const field = (text) => {
    const label = [...host.querySelectorAll("label")].find((candidate) => candidate.textContent.startsWith(text));
    if (label?.control) return label.control;
    let container = label?.parentElement;
    while (container && !container.querySelector("input")) container = container.parentElement;
    return container?.querySelector("input");
  };
  const change = async (input, value) => act(async () => { Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const language = async (labelText, locale) => {
    const label = [...host.querySelectorAll("label")].find((candidate) => candidate.textContent.startsWith(labelText));
    const button = [...label.parentElement.querySelectorAll("button")].find((candidate) => candidate.textContent === locale);
    await act(async () => button.click());
  };
  const dateFields = (label) => ({ date: host.querySelector(`[aria-label="Data · ${label}"]`), time: host.querySelector(`[aria-label="Ora · ${label}"]`) });
  const changeDateTime = async (label, wallTime) => {
    const fields = dateFields(label);
    const [date, time = ""] = wallTime.split("T");
    await change(fields.date, date ? date.split("-").reverse().join("/") : "");
    await change(fields.time, time);
  };
  const currentStep = () => Number([...host.querySelectorAll("[data-event-step]")].find((panel) => !panel.hidden).getAttribute("data-event-step"));
  const advance = () => act(async () => host.querySelector('button[data-event-advance],button[data-event-confirm]').click());
  const enter = () => act(async () => host.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  const review = async () => {
    for (let index = 0; index < 3 && currentStep() < 3; index += 1) {
      const previous = currentStep();
      await advance();
      if (currentStep() === previous) return;
    }
  };
  const submit = async () => { await review(); if (currentStep() === 3) await advance(); };
  const back = () => act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Indietro").click());
  return { host, field, change, language, dateFields, changeDateTime, currentStep, advance, enter, review, back, submit, saved, navigations, confirmations, deleted };
}

test("the wizard validates only the current step and Enter cannot create an event before the final review", async (context) => {
  const screen = await mount(context);
  assert.equal(screen.currentStep(), 0);
  assert.equal(screen.host.querySelectorAll("[data-event-step]").length, 4);
  assert.equal([...screen.host.querySelectorAll('[data-event-step]')].filter((panel) => !panel.hidden).length, 1);
  assert.equal(screen.host.querySelector('nav button[aria-current="step"]').textContent.trim(), "1Dettagli");
  assert.ok([...screen.host.querySelectorAll("nav button")].slice(1).every((button) => button.disabled));
  assert.equal(screen.host.querySelector("form").noValidate, true);
  await screen.enter();
  assert.equal(screen.currentStep(), 0);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /titolo in italiano/);
  assert.equal(screen.saved.length, 0);
  await screen.change(screen.field("Titolo"), "Evento guidato");
  await screen.enter();
  assert.equal(screen.currentStep(), 1, "unfilled dates cannot block the details step");
  assert.equal(document.activeElement, screen.host.querySelector("[data-wizard-progress]"));
  assert.equal(document.activeElement.tagName, "DIV");
  assert.ok(document.activeElement.contains(screen.host.querySelector("nav")), "focus and scrolling keep the entire step bar in view");
  assert.match(document.activeElement.className, /scroll-mt-40/);
  assert.equal(screen.saved.length, 0);
  await screen.enter();
  assert.equal(screen.currentStep(), 1);
  assert.equal(screen.saved.length, 0);
  await screen.changeDateTime("Inizio Evento", "2027-08-01T10:30");
  await screen.enter();
  assert.equal(screen.currentStep(), 2);
  assert.equal(screen.saved.length, 0);
  await screen.enter();
  assert.equal(screen.currentStep(), 3);
  assert.equal(screen.saved.length, 0);
  assert.match(screen.host.querySelector('[data-event-step="3"]').textContent, /Controlla prima di confermare/);
  await screen.advance();
  assert.equal(screen.saved.length, 1);
  assert.deepEqual(screen.navigations, [`/de/admin/eventi/${eventId}`]);
});

test("the native last Next click is canceled and mounts a distinct confirmation button without saving", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance();
  await screen.advance();
  const next = screen.host.querySelector("[data-event-advance]");
  assert.equal(next.type, "button");
  let nativeClick;
  next.addEventListener("click", (event) => { nativeClick = event; });
  await act(async () => next.click());
  assert.equal(nativeClick.defaultPrevented, true);
  assert.equal(screen.currentStep(), 3);
  assert.equal(screen.saved.length, 0);
  const confirm = screen.host.querySelector("[data-event-confirm]");
  assert.equal(confirm.type, "submit");
  assert.notEqual(confirm, next);
  assert.equal(next.isConnected, false);
  await act(async () => next.click());
  assert.equal(screen.saved.length, 0, "a stale navigation target cannot submit the review form");
  await act(async () => confirm.click());
  assert.equal(screen.saved.length, 1);
});

test("native Enter in a text field advances without saving, while Enter in a description remains a newline", async (context) => {
  const screen = await mount(context, baseEvent);
  const description = screen.field("Descrizione Completa");
  const newline = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => description.dispatchEvent(newline));
  assert.equal(newline.defaultPrevented, false);
  assert.equal(screen.currentStep(), 0);
  const key = new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => screen.field("Titolo").dispatchEvent(key));
  assert.equal(key.defaultPrevented, true);
  assert.equal(screen.currentStep(), 1);
  assert.equal(screen.saved.length, 0);
});

test("an Italian title remains mandatory with English active, while empty optional translation tabs never block next", async (context) => {
  const englishOnly = await mount(context);
  await englishOnly.language("Titolo", "en");
  await englishOnly.change(englishOnly.field("Titolo"), "English title");
  await englishOnly.advance();
  assert.equal(englishOnly.currentStep(), 0);
  assert.match(englishOnly.host.querySelector('[role="alert"]').textContent, /titolo in italiano/);
  assert.equal(englishOnly.field("Titolo").value, "");
  assert.equal(document.activeElement, englishOnly.field("Titolo"));
  await englishOnly.language("Titolo", "en");
  assert.equal(englishOnly.field("Titolo").value, "English title");
  assert.equal(englishOnly.saved.length, 0);
  const italian = await mount(context);
  await italian.change(italian.field("Titolo"), "Titolo italiano");
  await italian.language("Titolo", "en");
  assert.equal(italian.field("Titolo").value, "");
  await italian.advance();
  assert.equal(italian.currentStep(), 1);
  assert.equal(italian.saved.length, 0);
});

test("back and next preserve every translation and do not save until the organizer confirms the review", async (context) => {
  const screen = await mount(context, baseEvent);
  for (const language of ["it", "en", "de", "es"]) {
    for (const [label, value] of [["Titolo", `Titolo ${language}`], ["Sottotitolo", `Sottotitolo ${language}`], ["Descrizione Completa", `Descrizione ${language}`]]) {
      await screen.language(label, language);
      await screen.change(screen.field(label), value);
    }
  }
  await screen.advance();
  await screen.back();
  assert.equal(screen.field("Titolo").value, "Titolo es", "the active tab also survives navigation");
  for (const language of ["it", "en", "de", "es"]) {
    await screen.language("Titolo", language);
    assert.equal(screen.field("Titolo").value, `Titolo ${language}`);
  }
  await screen.review();
  assert.equal(screen.currentStep(), 3);
  assert.equal(screen.saved.length, 0);
  for (const language of ["it", "en", "de", "es"]) assert.ok(screen.host.querySelector('[data-event-step="3"]').textContent.includes(`Titolo ${language}`));
  await screen.advance();
  assert.deepEqual({ ...screen.saved[0].titolo }, { it: "Titolo it", en: "Titolo en", de: "Titolo de", es: "Titolo es" });
  assert.deepEqual({ ...screen.saved[0].descrizione }, { it: "Descrizione it", en: "Descrizione en", de: "Descrizione de", es: "Descrizione es" });
});

test("an incomplete date draft survives backward navigation and prevents jumping back to review", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.review();
  await screen.back();
  await screen.back();
  const input = screen.dateFields("Apertura check-in").date;
  await screen.change(input, "31/07/");
  await screen.back();
  const review = [...screen.host.querySelectorAll("nav button")].find((button) => button.textContent.includes("Riepilogo"));
  await act(async () => review.click());
  assert.equal(screen.currentStep(), 1);
  assert.equal(screen.dateFields("Apertura check-in").date, input, "panels must stay mounted");
  assert.equal(input.value, "31/07/");
  assert.equal(screen.saved.length, 0);
  assert.ok(screen.host.querySelector('[role="alert"]'));
});

test("the final confirmation rechecks incomplete local drafts inside hidden steps", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.review();
  await screen.change(screen.dateFields("Fine Evento").time, "12:");
  assert.equal(screen.currentStep(), 3);
  await screen.advance();
  assert.equal(screen.saved.length, 0);
  assert.equal(screen.currentStep(), 1);
  assert.equal(screen.dateFields("Fine Evento").time.value, "12:");
});

test("a double click on the final button sends only one pending creation", async (context) => {
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const screen = await mount(context, baseEvent, () => pending);
  await screen.review();
  const final = screen.host.querySelector('button[type="submit"]');
  await act(async () => { final.click(); final.click(); });
  assert.equal(screen.saved.length, 1);
  assert.equal(final.disabled, true);
  await act(async () => complete({ success: true, id: eventId }));
  assert.equal(screen.saved.length, 1);
});

test("event deletion still requires confirmation and preserves the server's sold-ticket protection", async (context) => {
  const canceled = await mount(context, baseEvent);
  await act(async () => [...canceled.host.querySelectorAll("button")].find((button) => button.textContent.trim() === "Elimina Evento").click());
  assert.equal(canceled.confirmations.length, 1);
  assert.equal(canceled.deleted.length, 0);
  const protectedEvent = await mount(context, baseEvent, undefined, undefined, { confirmDelete: true, deleteResult: { error: "Non puoi eliminare un evento che ha dei biglietti venduti." } });
  await act(async () => [...protectedEvent.host.querySelectorAll("button")].find((button) => button.textContent.trim() === "Elimina Evento").click());
  assert.deepEqual(protectedEvent.deleted, [eventId]);
  assert.equal(protectedEvent.saved.length, 0);
  assert.match(protectedEvent.host.querySelector('[role="alert"]').textContent, /biglietti venduti/);
  assert.deepEqual(protectedEvent.navigations, []);
});

test("new advanced event workflow creates a draft and opens package setup in the current locale", async (context) => {
  const screen = await mount(context);
  await screen.change(screen.field("Titolo"), "Evento guidato");
  await screen.advance();
  await screen.changeDateTime("Inizio Evento", "2027-08-01T10:30");
  await screen.advance();
  await act(async () => screen.host.querySelector('input[value="advanced"]').click());
  assert.equal(screen.field("Prezzo del biglietto"), undefined);
  assert.equal(screen.host.querySelector('input[type="checkbox"]').disabled, true);
  assert.equal(screen.host.querySelector('input[type="checkbox"]').checked, false);
  assert.match(screen.host.textContent, /Crea la bozza → 2. Configura i biglietti → 3. Pubblica/);
  await screen.review();
  assert.equal(screen.saved.length, 0);
  assert.match(screen.host.querySelector('button[type="submit"]').textContent, /Crea bozza e configura biglietti/);
  await screen.submit();
  assert.equal(screen.saved[0].attivo, false);
  assert.equal(screen.saved[0].ticketing_mode, "advanced");
  assert.equal(screen.saved[0].data_inizio, "2027-08-01T08:30:00.000Z");
  assert.deepEqual(screen.navigations, [`/de/admin/eventi/${eventId}/commerce`]);
});

test("editing existing event details preserves Rome time and zero capacity", async (context) => {
  const screen = await mount(context, baseEvent);
  assert.equal(screen.dateFields("Inizio Evento").date.value, "01/08/2027");
  assert.equal(screen.dateFields("Inizio Evento").time.value, "10:30");
  assert.equal(screen.dateFields("Fine Evento").date.value, "01/08/2027");
  assert.equal(screen.dateFields("Fine Evento").time.value, "12:30");
  assert.equal(screen.field("Posti Totali").value, "0");
  await screen.submit();
  assert.equal(screen.saved[0].data_inizio, baseEvent.data_inizio);
  assert.equal(screen.saved[0].data_fine, baseEvent.data_fine);
  assert.equal(screen.saved[0].capacity, 0);
  assert.equal(screen.saved[0].prezzo_cents, 3500);
  assert.deepEqual(screen.navigations, []);
});

test("unchanged existing instants preserve seconds and their known offset during the repeated Rome hour", async (context) => {
  const existing = { ...baseEvent, data_inizio: "2026-10-25T00:30:45.000Z", data_fine: "2026-10-25T01:30:45.000Z", check_in_starts_at: "2026-10-25T00:15:37.123Z" };
  const screen = await mount(context, existing);
  assert.equal(screen.dateFields("Inizio Evento").date.value, "25/10/2026");
  assert.equal(screen.dateFields("Inizio Evento").time.value, "02:30");
  assert.equal(screen.dateFields("Fine Evento").date.value, "25/10/2026");
  assert.equal(screen.dateFields("Fine Evento").time.value, "02:30");
  assert.equal(screen.dateFields("Apertura check-in").date.value, "25/10/2026");
  assert.equal(screen.dateFields("Apertura check-in").time.value, "02:15");
  await screen.submit();
  assert.equal(screen.saved[0].data_inizio, existing.data_inizio);
  assert.equal(screen.saved[0].data_fine, existing.data_fine);
  assert.equal(screen.saved[0].check_in_starts_at, existing.check_in_starts_at);
});

test("the opening is displayed in Italian format and saves the previous day's Rome time as its real instant", async (context) => {
  const screen = await mount(context, baseEvent);
  assert.equal(screen.dateFields("Apertura check-in").date.value, "");
  assert.equal(screen.dateFields("Apertura check-in").time.value, "");
  assert.match(screen.host.textContent, /orario italiano \(Europe\/Rome\)/);
  assert.equal(screen.host.querySelector('input[type="datetime-local"]'), null);
  await screen.changeDateTime("Apertura check-in", "2027-07-31T18:45");
  assert.equal(screen.dateFields("Apertura check-in").date.value, "31/07/2027");
  assert.equal(screen.dateFields("Apertura check-in").time.value, "18:45");
  await screen.submit();
  assert.equal(screen.saved[0].check_in_starts_at, "2027-07-31T16:45:00.000Z");
});

test("an unspecified opening stays null and an organizer can explicitly clear a saved opening", async (context) => {
  const unspecified = await mount(context, baseEvent);
  await unspecified.submit();
  assert.equal(unspecified.saved[0].check_in_starts_at, null);
  const screen = await mount(context, { ...baseEvent, check_in_starts_at: "2027-08-01T07:30:00.000Z" });
  await screen.changeDateTime("Apertura check-in", "");
  await screen.submit();
  assert.equal(screen.saved[0].check_in_starts_at, null);
});

test("moving the event before its existing opening is rejected before an event save", async (context) => {
  const screen = await mount(context, { ...baseEvent, check_in_starts_at: "2027-08-01T07:30:00.000Z" });
  await screen.changeDateTime("Inizio Evento", "2027-08-01T09:00");
  await screen.submit();
  assert.equal(screen.saved.length, 0);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /apertura del check-in.*successiva/);
});

for (const [name, start, opening, expected] of [
  ["spring DST gap", "2027-03-28T09:00:00.000Z", "2027-03-28T02:15", /non esiste in Italia/],
  ["repeated autumn hour", "2026-10-25T09:00:00.000Z", "2026-10-25T02:15", /Ora ambigua/],
]) {
  test(`a newly entered check-in opening in the ${name} cannot silently change its instant`, async (context) => {
    const screen = await mount(context, { ...baseEvent, data_inizio: start, data_fine: null });
    await screen.changeDateTime("Apertura check-in", opening);
    await screen.submit();
    assert.equal(screen.saved.length, 0);
    assert.match(screen.host.querySelector('[role="alert"]').textContent, expected);
  });
}

test("an explicit zero price remains zero when editing a free event", async (context) => {
  const screen = await mount(context, { ...baseEvent, prezzo_cents: 0 });
  assert.equal(screen.field("Prezzo del biglietto").value, "0,00");
  await screen.submit();
  assert.equal(screen.saved[0].prezzo_cents, 0);
});

test("the single ticket price uses Italian decimals and a comma input saves the exact cents", async (context) => {
  const screen = await mount(context, baseEvent);
  const price = screen.field("Prezzo del biglietto");
  assert.equal(price.value, "35,00");
  assert.equal(price.lang, "it-IT");
  assert.equal(price.inputMode, "decimal");
  await screen.change(price, "12,50");
  await screen.submit();
  assert.equal(screen.saved[0].prezzo_cents, 1250);
});

test("enabled packages hide the legacy price and keep it unchanged; draft return links preserve advanced mode", async (context) => {
  const screen = await mount(context, { ...baseEvent, commerce_config: validConfig });
  assert.equal(screen.field("Prezzo del biglietto"), undefined);
  assert.equal(screen.host.querySelector('input[value="single"]').disabled, true);
  await screen.submit();
  assert.equal(screen.saved[0].prezzo_cents, 3500);
  assert.equal(screen.saved[0].attivo, true);
  const returned = await mount(context, { ...baseEvent, attivo: false }, { success: true, id: eventId }, "advanced");
  assert.equal(returned.host.querySelector('input[value="advanced"]').checked, true);
  assert.equal(returned.host.querySelector('input[type="checkbox"]').disabled, true);
});

test("failed saves stay in the creation form and announce the error", async (context) => {
  const screen = await mount(context, baseEvent, { error: "Salvataggio non riuscito" });
  await screen.submit();
  assert.equal(screen.host.querySelector('[role="alert"]').textContent, "Salvataggio non riuscito");
  assert.deepEqual(screen.navigations, []);
});

test("event list exposes scoped package and check-in links without stale legacy sales counts for advanced events", async () => {
  const { DataTable } = load("components/admin/data-table.tsx");
  const { default: Page } = load("app/[locale]/admin/eventi/page.tsx", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select() { return this; }, order: async () => ({ data: [{ ...baseEvent, commerce_config: validConfig }], error: null }) }) }) },
    "@/components/admin/data-table": { DataTable }, "@/i18n/routing": routing,
    "next-intl/server": { getLocale: async () => "it" }, "@/lib/i18n-utils": i18n, "@/lib/commerce/config": config,
  });
  const html = renderToStaticMarkup(await Page());
  assert.ok(html.includes(`href="/admin/eventi/${eventId}/commerce"`));
  assert.ok(html.includes(`href="/admin/biglietti?event=${eventId}"`));
  assert.ok(html.includes("Formule e scaglioni"));
  assert.equal(html.includes("venduti"), false);
  assert.equal(html.includes("Gratis"), false);
});
