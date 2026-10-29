import { nativeVideoModule } from "./helpers/native-video-modules.mjs";
import { youtubeModule } from "./helpers/youtube-modules.mjs";
import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import { richTextDynamicFixture } from "./helpers/rich-text-editor-fixture.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/de/admin/eventi/nuovo", pretendToBeVisual: true });
const original = new Map();
class ResizeObserverFixture { observe() {} unobserve() {} disconnect() {} }
dom.window.ResizeObserver = ResizeObserverFixture;
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document, Event: dom.window.Event, FormData: dom.window.FormData, MutationObserver: dom.window.MutationObserver, ResizeObserver: ResizeObserverFixture, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
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
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => id in mocks ? mocks[id] : id === "@/lib/rich-text" ? richText : id === "@/components/public/event-description" ? eventDescription : id === "@/lib/events/native-video" ? nativeVideoModule : id === "@/lib/events/youtube" ? youtubeModule : id === "@/lib/events/affiliates" ? load("lib/events/affiliates.ts") : require(id), Date, Intl, Error, URL, window: dom.window, crypto: webcrypto, FormData: dom.window.FormData, console: { error() {} } });
  return compiledModule.exports;
}
const config = load("lib/commerce/config.ts");
const logistics = load("lib/events/logistics.ts");
const rome = load("lib/commerce/rome-time.ts");
const customSelect = load("components/ui/custom-select.tsx", { "./custom-select.module.css": {} });
const elements = load("components/admin/form-elements.tsx", { "@/components/ui/custom-select": customSelect, "next/dynamic": richTextDynamicFixture });
const i18n = load("lib/i18n-utils.ts");
const Anchor = ({ children, ...props }) => React.createElement("a", props, children);
const routing = { Link: Anchor };
const eventId = "12345678-1111-4111-8111-123456789abc";
const validConfig = { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [{ id: "ws", name: "Workshop", kind: "workshop", capacity: 20, startsAt: null, salesEnd: null, menuOptions: [] }], packages: [{ id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["ws"], prices: [{ id: "standard", label: "Standard", amountCents: 2000, startsAt: null, endsAt: null }] }], addons: [] };
const baseEvent = { id: eventId, titolo: { it: "Evento di prova" }, sottotitolo: null, descrizione: null, slug: "evento-di-prova", tipo: "evento", data_inizio: "2027-08-01T08:30:00.000Z", data_fine: "2027-08-01T10:30:00.000Z", check_in_starts_at: null, prezzo_cents: 3500, capacity: 0, location: "Bolzano", indirizzo: null, copertina_url: null, attivo: true, posti_venduti: 0 };

function serverFixture(existing = baseEvent, { registered = existing?.affiliates || [], registryError = false, upsertError = null } = {}) {
  const saved = [];
  const db = { from(table) {
    if (table === "affiliates") return { select() { return this; }, async in(_key, ids) { return { data: registryError ? null : registered.filter(row => ids.includes(row.id)), error: registryError ? { message: "Private registry error" } : null }; } };
    assert.equal(table, "events");
    let patch;
    return { select() { return this; }, eq() { return this; }, upsert(value) { patch = value; saved.push(value); return this; }, async single() { return patch && upsertError ? { data: null, error: upsertError } : { data: patch ? { ...patch, id: eventId } : existing, error: null }; } };
  } };
  const actions = load("app/api/admin/eventi/actions.ts", { "@/lib/events/logistics": logistics, "@/lib/commerce/config": config, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => db }, "next/cache": { revalidatePath() {} } });
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
  const saved = []; const navigations = []; const confirmations = []; const deleted = []; const uploads = [];
  const dateTime = load("components/admin/date-time-field.tsx");
  const wizard = load("components/admin/wizard-steps.tsx");
  const logisticsEditor = load("components/admin/event-logistics-editor.tsx", { "@/components/admin/form-elements": elements });
  const poster = load("components/admin/poster-upload.tsx", {
    "@/components/admin/form-elements": elements,
    "@/app/api/admin/upload/actions": { uploadImageAction: async (data) => { uploads.push({ file: data.get("file"), folder: data.get("folder") }); return typeof options.uploadResult === "function" ? options.uploadResult(data) : options.uploadResult || { success: true, url: "https://assets.example.test/poster.png" }; } },
  });
  const { EventForm } = load("app/[locale]/admin/eventi/[id]/event-form.tsx", {
    "@/components/admin/form-elements": elements, "@/i18n/routing": routing,
    "@/components/admin/date-time-field": dateTime,
    "@/components/admin/wizard-steps": wizard,
    "@/components/admin/event-logistics-editor": logisticsEditor,
    "@/components/admin/event-affiliates-picker": load("components/admin/event-affiliates-picker.tsx", { "@/i18n/routing": routing }),
    "@/components/admin/poster-upload": poster,
    "@/lib/events/logistics": logistics,
    "@/lib/commerce/config": config, "@/lib/commerce/rome-time": rome,
    "next/navigation": { useRouter: () => ({ push: (url) => navigations.push(url) }) },
    "@/components/ui/modal-provider": { useModal: () => ({ showConfirm: async (value) => { confirmations.push(value); return Boolean(options.confirmDelete); } }) },
    "@/app/api/admin/eventi/actions": { upsertEvent: async (payload) => { saved.push(payload); return typeof result === "function" ? result(payload) : result; }, deleteEvent: async (id) => { deleted.push(id); return options.deleteResult || { success: true }; } },
  });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await act(async () => root.render(React.createElement(EventForm, { initialData, locale: "de", initialTicketingMode, availableAffiliates: options.availableAffiliates || initialData?.affiliates || [], affiliateRegistryError: options.affiliateRegistryError })));
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
    for (let index = 0; index < 4 && currentStep() < 4; index += 1) {
      const previous = currentStep();
      await advance();
      if (currentStep() === previous) return;
    }
  };
  const submit = async () => { await review(); if (currentStep() === 4) await advance(); };
  const back = () => act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Indietro").click());
  const upload = async (file) => {
    const input = field("Carica locandina");
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
  };
  const click = async (text, scope = host) => {
    const button = [...scope.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === text);
    assert.ok(button, `Button not found: ${text}`);
    await act(async () => button.click());
  };
  return { host, field, change, language, dateFields, changeDateTime, currentStep, advance, enter, review, back, submit, upload, click, saved, navigations, confirmations, deleted, uploads };
}

const withinField = (scope, text) => [...scope.querySelectorAll("label")].find((label) => label.textContent.startsWith(text))?.control;
async function localizedField(screen, scope, labelText, language, value) {
  const label = [...scope.querySelectorAll("label")].find((candidate) => candidate.textContent.startsWith(labelText));
  await screen.click(language, label.parentElement);
  await screen.change(label.control, value);
}

test("the optional fifth-step wizard has no invented travel data and saves an empty logistics step as null", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.review();
  assert.equal(screen.currentStep(), 4);
  assert.equal(screen.host.querySelectorAll("[data-accommodation]").length, 0);
  assert.equal(screen.host.querySelectorAll("[data-arrival]").length, 0);
  assert.match(screen.host.querySelector('[data-event-step="4"]').textContent, /Nessuna informazione aggiunta/);
  assert.equal(screen.saved.length, 0);
  await screen.advance();
  assert.equal(screen.saved[0].logistics, null);
});

test("repeatable accommodation and arrival data preserves all four languages and appears in the final summary", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance(); await screen.advance(); await screen.advance();
  assert.equal(screen.currentStep(), 3);
  await screen.click("Aggiungi struttura");
  const first = screen.host.querySelector("[data-accommodation]");
  await screen.change(withinField(first, "Nome struttura"), "Hotel di collaudo");
  await screen.change(withinField(first, "Link prenotazione"), "https://hotel.example.test/book");
  const kind = first.querySelector("select");
  await act(async () => { kind.value = "partner"; kind.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  await screen.change(withinField(first, "Convenzione valida"), "30/11/2027");
  for (const language of ["it", "en", "de", "es"]) await localizedField(screen, first, "Vantaggi della convenzione", language, `Vantaggio ${language}`);
  await screen.click("Aggiungi struttura");
  const second = screen.host.querySelectorAll("[data-accommodation]")[1];
  await screen.change(withinField(second, "Nome struttura"), "Seconda struttura");
  await screen.click("Aggiungi percorso");
  const arrival = screen.host.querySelector("[data-arrival]");
  for (const language of ["it", "en", "de", "es"]) {
    await localizedField(screen, arrival, "Titolo percorso", language, `Percorso ${language}`);
    await localizedField(screen, arrival, "Indicazioni per arrivare", language, `Indicazioni ${language}`);
    await screen.language("Accessibilità e necessità specifiche", language);
    await screen.change(screen.field("Accessibilità e necessità specifiche"), `Accessibilità ${language}`);
    await screen.language("Contatto per viaggio e soggiorno", language);
    await screen.change(screen.field("Contatto per viaggio e soggiorno"), `Contatto ${language}`);
  }
  await screen.advance();
  assert.equal(screen.currentStep(), 4);
  assert.match(screen.host.querySelector('[aria-label="Riepilogo viaggio e soggiorno"]').textContent, /2 strutture.*1 percors/);
  assert.ok(screen.host.querySelector('[data-event-step="4"]').textContent.includes("Hotel di collaudo"));
  await screen.advance();
  const stored = screen.saved[0].logistics;
  assert.equal(stored.accommodations.length, 2);
  assert.equal(stored.accommodations[0].kind, "partner");
  assert.equal(stored.accommodations[0].validUntil, "2027-11-30");
  assert.equal(stored.accommodations[0].bookingUrl, "https://hotel.example.test/book");
  for (const language of ["it", "en", "de", "es"]) {
    assert.equal(stored.accommodations[0].benefits[language], `Vantaggio ${language}`);
    assert.equal(stored.arrivals[0].description[language], `Indicazioni ${language}`);
    assert.equal(stored.accessibility[language], `Accessibilità ${language}`);
    assert.equal(stored.contact[language], `Contatto ${language}`);
  }
});

test("blank rows require names or an Italian arrival title and removal preserves the remaining rows", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance(); await screen.advance(); await screen.advance();
  await screen.click("Aggiungi struttura");
  const first = screen.host.querySelector("[data-accommodation]");
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /nome di ogni struttura/);
  await screen.change(withinField(first, "Nome struttura"), "Struttura da conservare");
  await screen.click("Aggiungi struttura");
  const second = screen.host.querySelectorAll("[data-accommodation]")[1];
  await screen.click("Rimuovi struttura", second);
  await screen.click("Aggiungi percorso");
  const arrival = screen.host.querySelector("[data-arrival]");
  await localizedField(screen, arrival, "Titolo percorso", "en", "English arrival");
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /titolo del percorso in italiano/);
  assert.equal(withinField(arrival, "Titolo percorso").value, "");
  await screen.click("Rimuovi percorso", arrival);
  await screen.advance(); await screen.advance();
  assert.equal(screen.saved[0].logistics.accommodations.length, 1);
  assert.equal(screen.saved[0].logistics.accommodations[0].name, "Struttura da conservare");
  assert.equal(screen.saved[0].logistics.arrivals.length, 0);
});

test("an invalid link or partial agreement date cannot silently become empty optional logistics", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance(); await screen.advance(); await screen.advance();
  await screen.click("Aggiungi struttura");
  const hotel = screen.host.querySelector("[data-accommodation]");
  await screen.change(withinField(hotel, "Nome struttura"), "Struttura verificata");
  await screen.change(withinField(hotel, "Link prenotazione"), "javascript:alert(1)");
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.equal(screen.saved.length, 0);
  assert.equal(withinField(hotel, "Link prenotazione").value, "javascript:alert(1)");
  assert.equal(document.activeElement, withinField(hotel, "Link prenotazione"));
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /http o https.*Link prenotazione/);
  await screen.change(withinField(hotel, "Link prenotazione"), "https://hotel.example.test");
  const date = withinField(hotel, "Informazioni valide");
  await screen.change(date, "31/02/2027");
  await screen.back(); await screen.advance();
  assert.equal(withinField(hotel, "Informazioni valide"), date);
  assert.equal(date.value, "31/02/2027");
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.equal(screen.saved.length, 0);
  await screen.change(date, "28/02/2027");
  await screen.click("Aggiungi percorso");
  const arrival = screen.host.querySelector("[data-arrival]");
  await localizedField(screen, arrival, "Titolo percorso", "it", "Dalla stazione");
  const link = withinField(arrival, "Link informazioni sul percorso");
  await screen.change(link, "javascript:alert(2)");
  await act(async () => { arrival.open = false; });
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.equal(arrival.open, true);
  assert.equal(document.activeElement, link);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /http o https.*Link informazioni sul percorso/);
  await screen.change(link, "https://travel.example.test");
  const email = withinField(hotel, "Email struttura");
  await screen.change(email, "not-an-email");
  await screen.advance();
  assert.equal(document.activeElement, email);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /indirizzo email valido/);
  await screen.change(email, "hotel@example.test");
  await screen.advance(); await screen.advance();
  assert.equal(screen.saved[0].logistics.accommodations[0].validUntil, "2027-02-28");
});

test("poster upload uses the real action interface and the full image preview accepts a non-4:5 ratio", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance(); await screen.advance();
  await screen.upload(new dom.window.File(["PNG fixture"], "locandina.png", { type: "image/png" }));
  assert.equal(screen.uploads.length, 1);
  assert.equal(screen.uploads[0].folder, "events");
  assert.equal(screen.uploads[0].file.name, "locandina.png");
  assert.equal(screen.field("URL Immagine").value, "https://assets.example.test/poster.png");
  const image = screen.host.querySelector("[data-poster-preview] img");
  assert.match(image.className, /object-contain/);
  assert.match(image.parentElement.className, /aspect-\[4\/5\]/);
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 1200 } });
  await act(async () => image.dispatchEvent(new dom.window.Event("load")));
  assert.match(screen.host.textContent, /1200 × 1200 px.*Rapporto diverso da 4:5/);
  assert.equal(screen.saved.length, 0);
  await screen.submit();
  assert.equal(screen.saved[0].copertina_url, "https://assets.example.test/poster.png");
});

test("poster validation, upload failure and broken preview keep the existing URL and form data", async (context) => {
  const originalUrl = "https://assets.example.test/original.jpg";
  const screen = await mount(context, { ...baseEvent, copertina_url: originalUrl }, undefined, undefined, { uploadResult: { success: false, error: "Storage non disponibile" } });
  await screen.advance(); await screen.advance();
  await screen.upload(new dom.window.File(["gif"], "invalid.gif", { type: "image/gif" }));
  assert.equal(screen.uploads.length, 0);
  assert.equal(screen.field("URL Immagine").value, originalUrl);
  const large = new dom.window.File(["png"], "large.png", { type: "image/png" });
  Object.defineProperty(large, "size", { value: 8 * 1024 * 1024 + 1 });
  await screen.upload(large);
  assert.equal(screen.uploads.length, 0);
  assert.match(screen.host.textContent, /massimo 8 MB/);
  await screen.upload(new dom.window.File(["png"], "valid.png", { type: "image/png" }));
  assert.equal(screen.uploads.length, 1);
  assert.match(screen.host.textContent, /Storage non disponibile/);
  assert.equal(screen.field("URL Immagine").value, originalUrl);
  const image = screen.host.querySelector("[data-poster-preview] img");
  await act(async () => image.dispatchEvent(new dom.window.Event("error")));
  assert.match(screen.host.textContent, /L’URL inserito è conservato/);
  assert.equal(screen.field("URL Immagine").value, originalUrl);
  await screen.click("Riprova anteprima");
  assert.equal(screen.host.querySelector("[data-poster-preview] img").getAttribute("src"), originalUrl);
  assert.equal(screen.field("Titolo").value, "Evento di prova");
  assert.equal(screen.saved.length, 0);
});

test("navigation and early submits wait for an unfinished poster upload", async (context) => {
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const screen = await mount(context, baseEvent, undefined, undefined, { uploadResult: () => pending });
  await screen.advance(); await screen.advance();
  await screen.upload(new dom.window.File(["png"], "upload.png", { type: "image/png" }));
  assert.equal(screen.host.querySelector("[data-event-advance]").disabled, true);
  await screen.enter();
  assert.equal(screen.currentStep(), 2);
  assert.equal(screen.saved.length, 0);
  await act(async () => complete({ success: true, url: "https://assets.example.test/finished.png" }));
  assert.equal(screen.host.querySelector("[data-event-advance]").disabled, false);
  await screen.submit();
  assert.equal(screen.saved[0].copertina_url, "https://assets.example.test/finished.png");
});

test("the wizard validates only the current step and Enter cannot create an event before the final review", async (context) => {
  const screen = await mount(context);
  assert.equal(screen.currentStep(), 0);
  assert.equal(screen.host.querySelectorAll("[data-event-step]").length, 5);
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
  await screen.enter();
  assert.equal(screen.currentStep(), 4);
  assert.equal(screen.saved.length, 0);
  assert.match(screen.host.querySelector('[data-event-step="4"]').textContent, /Controlla prima di confermare/);
  await screen.advance();
  assert.equal(screen.saved.length, 1);
  assert.deepEqual(screen.navigations, [`/de/admin/eventi/${eventId}`]);
});

test("the native last Next click is canceled and mounts a distinct confirmation button without saving", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.advance();
  await screen.advance();
  await screen.advance();
  const next = screen.host.querySelector("[data-event-advance]");
  assert.equal(next.type, "button");
  let nativeClick;
  next.addEventListener("click", (event) => { nativeClick = event; });
  await act(async () => next.click());
  assert.equal(nativeClick.defaultPrevented, true);
  assert.equal(screen.currentStep(), 4);
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
  assert.equal(screen.currentStep(), 4);
  assert.equal(screen.saved.length, 0);
  for (const language of ["it", "en", "de", "es"]) assert.ok(screen.host.querySelector('[data-event-step="4"]').textContent.includes(`Titolo ${language}`));
  await screen.advance();
  assert.deepEqual({ ...screen.saved[0].titolo }, { it: "Titolo it", en: "Titolo en", de: "Titolo de", es: "Titolo es" });
  assert.deepEqual({ ...screen.saved[0].descrizione }, { it: "Descrizione it", en: "Descrizione en", de: "Descrizione de", es: "Descrizione es" });
});

test("an incomplete date draft survives backward navigation and prevents jumping back to review", async (context) => {
  const screen = await mount(context, baseEvent);
  await screen.review();
  await screen.back();
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
  assert.equal(screen.currentStep(), 4);
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

test("event list exposes statistics, packages and check-in without stale legacy sales counts", async () => {
  const { EventsListClient } = load("app/[locale]/admin/eventi/events-list-client.tsx", {
    "@/i18n/routing": routing,
    "@/components/ui/custom-select": customSelect,
  });
  const { default: Page } = load("app/[locale]/admin/eventi/page.tsx", {
    "@/lib/admin/analytics": { loadAdminAnalytics: async () => ({ eventStats: [{ id: eventId, title: "Meraki", startsAt: baseEvent.data_inizio, endsAt: null, status: "upcoming", capacity: 100, remaining: 83, netCents: 6500, validParticipants: 17, checkedInParticipants: 2, registrationSummary: { count: 17, netAfterFeesCents: 6500 }, dinnerSummary: { count: 0, netAfterFeesCents: 0 } }] }) },
    "./events-list-client": { EventsListClient },
    "next-intl/server": { getLocale: async () => "it" },
  });
  const html = renderToStaticMarkup(await Page());
  assert.ok(html.includes(`href="/admin/eventi/${eventId}/statistiche"`));
  assert.ok(html.includes(`href="/admin/eventi/${eventId}/commerce"`));
  assert.ok(html.includes(`href="/admin/biglietti?event=${eventId}"`));
  assert.ok(html.includes("Formule e prezzi"));
  assert.ok(html.includes("Iscritti attività"));
  assert.ok(html.includes("Netto cena"));
  assert.equal(html.includes("venduti"), false);
  assert.equal(html.includes("Gratis"), false);
});

const tripText = (it = "", en = "", de = "", es = "") => ({ it, en, de, es });
const connectedTrip = () => ({ ...logistics.emptyEventLogistics(), arrivals: [{ id: "airport", mode: "plane", title: tripText("Dall’aeroporto alla sede"), arrivalPoint: tripText("Aeroporto di prova", "Test airport"), description: tripText(), linkUrl: "", connections: [
  { id: "airport-bus", mode: "bus", from: tripText("Aeroporto di prova", "Test airport"), to: tripText("Stazione di prova", "Test station"), service: tripText("Linea di prova A"), duration: tripText("30 minuti"), description: tripText("Scendi alla stazione"), linkUrl: "https://transport.example.test/bus", mapUrl: "" },
  { id: "station-walk", mode: "walk", from: tripText("Stazione di prova", "Test station"), to: tripText("Sede dell’evento", "Event venue"), service: tripText(), duration: tripText("10 minuti"), description: tripText(), linkUrl: "", mapUrl: "https://maps.example.test/venue" },
] }] });

test("nested connection validation reveals the route and switches to the exact missing Italian field", async (context) => {
  const screen = await mount(context, { ...baseEvent, logistics: connectedTrip() });
  await screen.advance(); await screen.advance(); await screen.advance();
  const route = screen.host.querySelector('[data-arrival="airport"]');
  const departure = route.querySelector('[data-logistics-path="arrivals.0.connections.1.from"]');
  await screen.change(departure, "");
  await screen.click("en", departure.parentElement);
  assert.equal(departure.value, "Test station");
  await act(async () => { route.open = false; });
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.equal(route.open, true);
  assert.equal(departure.value, "");
  assert.equal(document.activeElement, departure);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /Collegamento 2.*partenza.*italiano/);
  assert.equal(screen.saved.length, 0);
  await screen.change(departure, "Stazione di prova");
  const link = route.querySelector('[data-logistics-path="arrivals.0.connections.1.mapUrl"]');
  await screen.change(link, "javascript:alert(1)");
  await act(async () => { route.open = false; });
  await screen.advance();
  assert.equal(screen.currentStep(), 3);
  assert.equal(route.open, true);
  assert.equal(document.activeElement, link);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /Collegamento 2.*http o https.*Link mappa/);
  assert.equal(screen.saved.length, 0);
});

test("the final review and save keep ordered connections and reload their translations", async (context) => {
  const trip = connectedTrip();
  const screen = await mount(context, { ...baseEvent, logistics: trip });
  await screen.review();
  assert.equal(screen.currentStep(), 4);
  const review = screen.host.querySelector('[aria-label="Riepilogo viaggio e soggiorno"]');
  assert.match(review.textContent, /Arrivo principale: Aeroporto di prova/);
  const legs = [...review.querySelectorAll("ol li")];
  assert.equal(legs.length, 2);
  assert.match(legs[0].textContent, /Autobus.*Aeroporto di prova → Stazione di prova.*Linea di prova A.*30 minuti/);
  assert.match(legs[1].textContent, /A piedi.*Stazione di prova → Sede dell’evento.*10 minuti/);
  await screen.advance();
  assert.equal(screen.saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(screen.saved[0].logistics)), JSON.parse(JSON.stringify(trip)));
  const reopened = await mount(context, { ...baseEvent, ...screen.saved[0] });
  await reopened.advance(); await reopened.advance(); await reopened.advance();
  assert.deepEqual([...reopened.host.querySelectorAll("[data-arrival-connection]")].map(row => row.getAttribute("data-arrival-connection")), ["airport-bus", "station-walk"]);
  const destination = reopened.host.querySelector('[data-logistics-path="arrivals.0.connections.1.to"]');
  await reopened.click("en", destination.parentElement);
  assert.equal(destination.value, "Event venue");
  assert.equal(reopened.host.querySelector('[data-logistics-path="arrivals.0.connections.0.service"]').value, "Linea di prova A");
});

const affiliateA = { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Scuola Aurora", active: true };
const affiliateB = { id: "bbbbbbbb-2222-4222-8222-222222222222", name: "Referente Bruno", active: false };

test("event affiliates use registry switches and save their stable identities only after review", async (context) => {
  const affiliateC = { id: "cccccccc-3333-4333-8333-333333333333", name: "Nuovo referente" };
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA, affiliateB] }, undefined, undefined, { availableAffiliates: [affiliateA, affiliateB, affiliateC] });
  await screen.advance(); await screen.advance();
  assert.equal(screen.currentStep(), 2);
  const original = screen.host.querySelector(`[data-event-affiliate="${affiliateA.id}"]`);
  assert.equal(original.querySelector('input[type="text"], input:not([type])'), null, "names come from the registry");
  assert.equal([...screen.host.querySelectorAll("button")].some(button => button.textContent === "Aggiungi affiliato"), false);
  assert.equal(original.querySelector("a").getAttribute("href"), `/admin/affiliati/${affiliateA.id}?event=${eventId}`);
  assert.ok(screen.host.querySelector(`[data-event-affiliate="${affiliateB.id}"] a`), "saved inactive affiliates retain participant access");
  const added = screen.host.querySelector(`[data-event-affiliate="${affiliateC.id}"]`);
  assert.equal(added.querySelector('[role="switch"]').checked, false);
  await act(async () => added.querySelector('[role="switch"]').click());
  assert.equal(added.querySelector("a"), null, "an unsaved association cannot link to an unavailable participant list");
  await act(async () => original.querySelector('[role="switch"]').click());
  await screen.review();
  assert.equal(screen.saved.length, 0);
  assert.match(screen.host.querySelector('[aria-label="Riepilogo biglietteria"]').textContent, /Affiliati: 1 attivi/);
  await screen.advance();
  assert.equal(JSON.stringify(screen.saved[0].affiliates), JSON.stringify([{ ...affiliateA, active: false }, affiliateB, { ...affiliateC, active: true }]));
  assert.equal(added.querySelector("a").getAttribute("href"), `/admin/affiliati/${affiliateC.id}?event=${eventId}`, "participant access becomes available after a successful save");
});

test("event affiliate search leaves selected affiliates intact and duplicate active names cannot be enabled", async (context) => {
  const duplicate = { id: "cccccccc-3333-4333-8333-333333333333", name: "Scuola Aurora" };
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA] }, undefined, undefined, { availableAffiliates: [affiliateA, affiliateB, duplicate] });
  await screen.advance(); await screen.advance();
  await act(async () => screen.host.querySelector(`[data-event-affiliate="${duplicate.id}"] [role="switch"]`).click());
  assert.match(screen.host.querySelector('[data-event-affiliates] [role="alert"]').textContent, /già abilitato/);
  assert.equal(screen.host.querySelector(`[data-event-affiliate="${duplicate.id}"] [role="switch"]`).checked, false);
  await screen.change(screen.host.querySelector('[data-event-affiliates] input[type="search"]'), "bruno");
  assert.equal(screen.host.querySelectorAll('[data-event-affiliate]').length, 1);
  assert.equal(screen.host.querySelector('[data-event-affiliate]').dataset.eventAffiliate, affiliateB.id);
  await screen.submit();
  assert.equal(screen.saved[0].affiliates.length, 1);
  assert.equal(screen.saved[0].affiliates[0].id, affiliateA.id);
  assert.equal(screen.saved[0].affiliates[0].active, true);
});

test("a failed registry read disables switches and cannot overwrite saved event affiliates", async (context) => {
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA] }, undefined, undefined, { affiliateRegistryError: "Anagrafica non disponibile." });
  await screen.advance(); await screen.advance();
  assert.match(screen.host.querySelector('[data-event-affiliates] [role="alert"]').textContent, /conservate/);
  assert.equal(screen.host.querySelector('[data-event-affiliates] [role="switch"]').disabled, true);
  await screen.submit();
  assert.equal(screen.saved.length, 1);
  assert.equal("affiliates" in screen.saved[0], false);
});

test("affiliate updates use registry names, preserve retired entries and leave omitted attribution settings untouched", async () => {
  const fixture = serverFixture({ ...baseEvent, affiliates: [affiliateA, affiliateB] });
  const result = await fixture.actions.upsertEvent({ ...baseEvent, affiliates: [{ ...affiliateA, name: "Scuola Aurora nuova" }] });
  assert.equal(result.success, true);
  assert.equal(JSON.stringify(fixture.saved[0].affiliates), JSON.stringify([affiliateA, affiliateB]));
  const retired = serverFixture({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal((await retired.actions.upsertEvent({ ...baseEvent, affiliates: [] })).success, true);
  assert.equal(JSON.stringify(retired.saved[0].affiliates), JSON.stringify([{ ...affiliateA, active: false }]));
  const omitted = serverFixture({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal((await omitted.actions.upsertEvent(baseEvent)).success, true);
  assert.equal("affiliates" in omitted.saved[0], false);
});

test("invalid affiliate configuration is rejected by the staff action before any event write", async () => {
  for (const entries of [[{ ...affiliateA, name: " " }], [affiliateA, { ...affiliateA, name: "Another" }], [affiliateA, { ...affiliateB, active: true, name: "SCUOLA AURORA" }], [{ ...affiliateA, id: "unsafe-id" }]]) {
    const fixture = serverFixture();
    const result = await fixture.actions.upsertEvent({ ...baseEvent, affiliates: entries });
    assert.equal(result.success, false);
    assert.match(result.error, /Controlla gli affiliati/);
    assert.equal(fixture.saved.length, 0);
  }
});

test("a failed historical affiliate lookup stops the event update instead of erasing attribution configuration", async () => {
  const fixture = serverFixture(null);
  const result = await fixture.actions.upsertEvent({ ...baseEvent, affiliates: [] });
  assert.equal(result.success, false);
  assert.match(result.error, /verificare lo storico degli affiliati/);
  assert.equal(fixture.saved.length, 0);
});

test("unknown affiliate identifiers and unavailable registry reads cannot create event affiliations", async () => {
  const unknown = serverFixture(baseEvent);
  const unknownResult = await unknown.actions.upsertEvent({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal(unknownResult.success, false);
  assert.match(unknownResult.error, /Seleziona gli affiliati dall’anagrafica/);
  assert.equal(unknown.saved.length, 0);
  const unavailable = serverFixture({ ...baseEvent, affiliates: [affiliateA] }, { registryError: true });
  const unavailableResult = await unavailable.actions.upsertEvent({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal(unavailableResult.success, false);
  assert.doesNotMatch(unavailableResult.error, /Private/);
  assert.equal(unavailable.saved.length, 0);
});


test("deleted affiliates are absent from new choices and retained as disabled history in an event", async context => {
  const removed = { ...affiliateA, deletedAt: "2026-10-26T13:00:00Z" };
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA] }, undefined, undefined, { availableAffiliates: [removed, affiliateB] });
  await screen.advance(); await screen.advance();
  const historical = screen.host.querySelector(`[data-event-affiliate="${affiliateA.id}"]`);
  assert.match(historical.textContent, /Eliminato dall’anagrafica/);
  assert.equal(historical.querySelector('[role="switch"]').disabled, true);
  assert.equal(historical.querySelector('[role="switch"]').checked, false);
  assert.ok(historical.querySelector('a'), "existing participant lists remain available");
  await screen.submit();
  assert.equal(screen.saved[0].affiliates[0].active, false, "stale open forms cannot reactivate a deleted affiliate");
});

test("new events cannot select deleted affiliates", async context => {
  const removed = { ...affiliateA, deletedAt: "2026-10-26T13:00:00Z" };
  const fresh = await mount(context, null, undefined, undefined, { availableAffiliates: [removed, affiliateB] });
  await fresh.change(fresh.field("Titolo"), "Nuovo evento"); await fresh.advance();
  await fresh.changeDateTime("Inizio Evento", "2027-08-01T10:30"); await fresh.advance();
  assert.equal(fresh.host.querySelector(`[data-event-affiliate="${affiliateA.id}"]`), null);
  assert.ok(fresh.host.querySelector(`[data-event-affiliate="${affiliateB.id}"]`));
});

test("staff action rejects active deleted affiliates while allowing inactive historic snapshots with original names", async () => {
  const deleted = { ...affiliateA, deleted_at: "2026-10-26T13:00:00Z" };
  const blocked = serverFixture({ ...baseEvent, affiliates: [affiliateA] }, { registered: [deleted] });
  const result = await blocked.actions.upsertEvent({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal(result.success, false);
  assert.match(result.error, /eliminato dall’anagrafica/);
  assert.equal(blocked.saved.length, 0);
  const history = serverFixture({ ...baseEvent, affiliates: [affiliateA] }, { registered: [{ ...deleted, name: "Nuovo nome in anagrafica" }] });
  assert.equal((await history.actions.upsertEvent({ ...baseEvent, affiliates: [{ ...affiliateA, active: false }] })).success, true);
  assert.equal(history.saved[0].affiliates[0].name, affiliateA.name);
});


test("historical fallback entries cannot be activated when their registry entry is unavailable", async context => {
  const screen = await mount(context, { ...baseEvent, affiliates: [{ ...affiliateA, active: false }] }, undefined, undefined, { availableAffiliates: [affiliateB] });
  await screen.advance(); await screen.advance();
  const fallback = screen.host.querySelector(`[data-event-affiliate="${affiliateA.id}"]`);
  assert.match(fallback.textContent, /Non disponibile nell’anagrafica/);
  assert.equal(fallback.querySelector('[role="switch"]').checked, false);
  assert.equal(fallback.querySelector('[role="switch"]').disabled, true);
});

test("new event associations display the initial default compensation before activation", async context => {
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA] }, undefined, undefined, { availableAffiliates: [affiliateA, { ...affiliateB, defaultCommissionCents: 700 }] });
  await screen.advance(); await screen.advance();
  const added = screen.host.querySelector(`[data-event-affiliate="${affiliateB.id}"]`);
  assert.match(added.textContent, /Compenso iniziale: 7,00/);
  assert.match(screen.host.querySelector('[data-event-affiliates]').textContent, /importi già impostati.*conservati/);
});

test("new event associations display default credits with their unit and never convert them to euro", async context => {
  const screen = await mount(context, { ...baseEvent, affiliates: [affiliateA] }, undefined, undefined, { availableAffiliates: [affiliateA, { ...affiliateB, defaultCommissionType: "credits", defaultCommissionCents: 0, defaultCommissionCredits: 3 }] });
  await screen.advance(); await screen.advance();
  const added = screen.host.querySelector(`[data-event-affiliate="${affiliateB.id}"]`);
  assert.match(added.textContent, /Compenso iniziale: 3 crediti per iscritto valido/);
  assert.doesNotMatch(added.textContent, /€/);
});

test("event creation and editing expose safe affiliate defaults without a duplicate compensation editor", async () => {
  const registryEntry = { ...affiliateB, createdAt: "2026-10-26T10:00:00Z", deletedAt: null, contactName: "PRIVATE CONTACT", email: "PRIVATE@example.test", phone: "PRIVATE PHONE", notes: "PRIVATE NOTES", defaultCommissionType: "credits", defaultCommissionCents: 0, defaultCommissionCredits: 3 };
  const EventForm = () => null;
  let legacyCompensationReads = 0;
  const page = load("app/[locale]/admin/eventi/[id]/page.tsx", {
    "@/components/admin/discount-codes-editor": { DiscountCodesEditor: () => null },
    "@/app/api/admin/commerce/actions": { loadCommerceDiscountsAdmin: async () => null },
    "@/lib/commerce/config": config,
    "@/app/api/admin/eventi/actions": { getEvent: async () => ({ success: true, data: baseEvent }) },
    "./event-form": { EventForm }, "next/navigation": { notFound() { throw new Error("Unexpected 404"); } }, "@/i18n/routing": routing,
    "@/components/admin/affiliate-commissions-editor": { AffiliateCommissionsEditor: () => React.createElement("section", { "data-duplicate-compensation": true }, "Compensi degli affiliati") },
    "@/app/api/admin/affiliati/commission-actions": { loadEventAffiliateCommissions: async () => { legacyCompensationReads++; return { success: true, rates: {} }; } },
    "@/lib/events/affiliate-registry": { loadAffiliateRegistry: async () => [registryEntry] },
  }).default;
  const find = node => !node || typeof node !== "object" ? undefined : node.type === EventForm ? node : React.Children.toArray(node.props?.children).map(find).find(Boolean);
  for (const id of ["nuovo", eventId]) {
    const tree = await page({ params: Promise.resolve({ id, locale: "it" }) });
    const form = find(tree);
    assert.ok(form);
    assert.deepEqual(JSON.parse(JSON.stringify(form.props.availableAffiliates)), [{ id: affiliateB.id, name: affiliateB.name, deletedAt: null, defaultCommissionType: "credits", defaultCommissionCents: 0, defaultCommissionCredits: 3 }]);
    assert.doesNotMatch(JSON.stringify(form.props), /PRIVATE|contactName|email|phone|notes|createdAt/);
    assert.doesNotMatch(renderToStaticMarkup(tree), /data-duplicate-compensation|Compensi degli affiliati/);
  }
  assert.equal(legacyCompensationReads, 0, "the event wizard must not load or mount a second editor of the same rates");
});

test("a concurrent deletion rejected by the database returns a localized event retry without exposing SQL messages", async () => {
  const fixture = serverFixture({ ...baseEvent, affiliates: [affiliateA] }, { upsertError: { code: "22023", message: "Affiliate unavailable" } });
  const result = await fixture.actions.upsertEvent({ ...baseEvent, affiliates: [affiliateA] });
  assert.equal(result.success, false);
  assert.match(result.error, /eliminato mentre modificavi/);
  assert.doesNotMatch(result.error, /Affiliate unavailable/);
});
