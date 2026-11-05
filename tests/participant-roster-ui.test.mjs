import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { after } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { nativeFormControlMocks } from "./helpers/native-form-controls.mjs";
import { participantDetailsModule } from "./helpers/participant-details.mjs";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/partecipanti", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, FormData: window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
});
const Link = ({ children, ...props }) => React.createElement("a", props, children);
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, URL, URLSearchParams, window, console, require: name => name in mocks ? mocks[name] : name in nativeFormControlMocks ? nativeFormControlMocks[name] : name === "@/components/admin/participant-details-button" ? participantDetailsModule(window) : name === "@/i18n/routing" ? { Link } : require(name) });
  return loaded.exports;
}
const eventId = "43491c74-13c3-4747-8eaa-fbf9432c323e";
const affiliateId = "5c9d7464-cf07-4f55-beb7-73263ff474f8";
const event = { id: eventId, title: "Vibra", startsAt: "2026-12-19T11:30:00Z", canceled: false };
const person = (id, overrides = {}) => ({
  id, source: "commerce", firstName: "Ada", lastName: "Rossi", email: "ada@example.test", phone: "+393331234567", buyerEmail: "acquirente@example.test", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "", maskedDocument: "************1234", packageName: "Workshop + Masterclass", status: "paid", valid: true, checkedIn: true, checkedInAt: "2026-12-19T11:30:00Z", createdAt: "2026-10-21T10:00:00Z", affiliateId, affiliateName: "Scuola Aurora", activities: [
    { id: "ada-ws", name: "Workshop", kind: "workshop", status: "used", checkedInAt: "2026-12-19T11:30:00Z", menuChoice: null },
    { id: "ada-mc", name: "Masterclass", kind: "masterclass", status: "valid", checkedInAt: null, menuChoice: null },
    { id: "ada-dinner", name: "Cena", kind: "dinner", status: "valid", checkedInAt: null, menuChoice: "Vegetariano" },
  ], privacyVersion: "2026-10", contactCreatedAt: "2026-10-21T10:00:00Z", marketingConsent: true, contactAvailable: true, ...overrides,
});
const roster = () => ({ event, affiliate: null, participants: [person("ada"), person("bruno", { source: "legacy", firstName: "Bruno", lastName: "Neri", email: "", phone: "", buyerEmail: "bruno-buyer@example.test", documentType: "", documentCountry: "", maskedDocument: "", packageName: "Ingresso evento", checkedIn: false, checkedInAt: null, affiliateId: null, affiliateName: "Acquisti diretti", activities: [], privacyVersion: "", contactCreatedAt: null, marketingConsent: null, contactAvailable: false }), person("rita", { firstName: "Rita", lastName: "Viola", email: "rita@example.test", phone: "+393338889999", status: "refunded", valid: false, checkedIn: false, checkedInAt: null, packageName: "Masterclass", activities: [{ id: "rita-mc", name: "Masterclass", kind: "masterclass", status: "refunded", checkedInAt: null, menuChoice: null }], marketingConsent: false })] });
async function mount(context, data = roster(), extra = {}) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const { ParticipantsClient } = load("app/[locale]/admin/partecipanti/participants-client.tsx");
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(ParticipantsClient, { data, ...extra })));
  context.after(async () => { await act(async () => root.unmount()); });
  const select = async (id, value) => { const control = window.document.getElementById(id); await act(async () => { control.value = value; control.dispatchEvent(new window.Event("change", { bubbles: true })); }); };
  const search = async value => { const control = window.document.getElementById("roster-search"); await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(control, value); control.dispatchEvent(new window.Event("input", { bubbles: true })); }); };
  return { select, search };
}
const count = label => [...window.document.querySelectorAll("dt")].find(node => node.textContent === label)?.nextElementSibling?.textContent;
const exportUrl = () => new URL([...window.document.querySelectorAll("a")].find(node => node.textContent === "Esporta CSV completo").href);

test("event roster includes every person, current formula, dinner and contacts while excluding refunds from valid counts", async context => {
  const data = roster(); data.participants[0].documentNumber = "PRIVATE-FULL-DOCUMENT";
  await mount(context, data);
  assert.equal(window.document.querySelectorAll("[data-roster-person]").length, 3);
  assert.equal(count("Iscritti validi"), "2"); assert.equal(count("Con check-in"), "1"); assert.equal(count("Totale nell’elenco"), "3");
  const ada = window.document.querySelector('[data-roster-person="ada"]');
  assert.ok(ada.textContent.includes("Workshop + Masterclass")); assert.ok(ada.textContent.includes("Cena")); assert.ok(ada.textContent.includes("Menu: Vegetariano"));
  assert.ok(ada.textContent.includes("ada@example.test")); assert.ok(ada.textContent.includes("+393331234567")); assert.ok(ada.textContent.includes("************1234"));
  assert.equal(ada.querySelector("details").open, false); assert.ok(ada.textContent.includes("Versione informativa privacy"));
  assert.ok(window.document.querySelector('[data-roster-person="rita"]').textContent.includes("Non conteggiato tra gli iscritti validi"));
  const bruno = window.document.querySelector('[data-roster-person="bruno"]');
  assert.ok(bruno.textContent.includes("Email partecipanteNon disponibile")); assert.ok(bruno.textContent.includes("Email acquirentebruno-buyer@example.test"));
  assert.ok(bruno.textContent.includes("Dati di iscrizione storici incompleti"));
  assert.equal(window.document.body.innerHTML.includes("PRIVATE-FULL-DOCUMENT"), false);
  assert.equal(window.document.querySelector("video,canvas"), null);
  const download = exportUrl(); assert.equal(download.pathname, "/api/admin/participants/export");
  assert.deepEqual(Object.fromEntries(download.searchParams), { event: eventId, affiliate: "all", status: "all", documents: "1" });
});

test("local search keeps complete export scope while affiliate and valid-status filters update it explicitly", async context => {
  const ui = await mount(context);
  await ui.search("+393331234567");
  assert.equal(window.document.querySelectorAll("[data-roster-person]").length, 1); assert.equal(count("Totale nell’elenco"), "3");
  assert.equal(exportUrl().searchParams.get("status"), "all"); assert.equal(exportUrl().searchParams.has("search"), false);
  await ui.search(""); await ui.select("roster-affiliate", affiliateId); await ui.select("roster-status", "valid");
  assert.equal(window.document.querySelectorAll("[data-roster-person]").length, 1); assert.ok(window.document.querySelector('[data-roster-person="ada"]'));
  assert.equal(count("Iscritti validi"), "1"); assert.equal(count("Totale nell’elenco"), "2");
  assert.equal(exportUrl().searchParams.get("affiliate"), affiliateId); assert.equal(exportUrl().searchParams.get("status"), "valid");
  await ui.select("roster-affiliate", "direct");
  assert.ok(window.document.querySelector('[data-roster-person="bruno"]')); assert.equal(exportUrl().searchParams.get("affiliate"), "direct");
  await ui.search("not-present"); assert.ok(window.document.body.textContent.includes("Nessun partecipante corrisponde ai filtri selezionati"));
});

test("scoped and empty rosters stay explicit and provide a route to the complete event", async context => {
  await mount(context, { ...roster(), affiliate: { id: affiliateId, name: "Scuola Aurora" }, participants: [] });
  assert.equal(window.document.getElementById("roster-affiliate").disabled, true);
  assert.ok(window.document.body.textContent.includes("Non ci sono ancora partecipanti per questo elenco"));
  assert.equal(count("Iscritti validi"), "0");
  assert.ok(window.document.querySelector(`a[href="/admin/partecipanti?event=${eventId}"]`));
  assert.equal(exportUrl().searchParams.get("affiliate"), affiliateId);
});

test("roster route requires an event, requests masked records and strips full documents before client serialization", async () => {
  const calls = []; const received = [];
  const data = roster(); data.participants[0].documentNumber = "PRIVATE-SERVER-DOCUMENT";
  const Page = load("app/[locale]/admin/partecipanti/page.tsx", {
    "@/lib/admin/participant-roster": { loadParticipantRosterEvents: async locale => { calls.push(["events", locale]); return [{ ...event, privateEmail: "PRIVATE-DIRECTORY" }]; }, loadParticipantRoster: async input => { calls.push(["roster", input]); return data; } },
    "./participants-client": { ParticipantsClient: props => { received.push(props); return React.createElement("p", null, JSON.stringify(props)); } },
  }).default;
  const choose = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "it" }), searchParams: Promise.resolve({}) }));
  assert.ok(choose.includes("Seleziona un evento")); assert.ok(choose.includes(`/admin/partecipanti?event=${eventId}`));
  assert.deepEqual(calls, [["events", "it"]]); assert.equal(choose.includes("PRIVATE-DIRECTORY"), false);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "de" }), searchParams: Promise.resolve({ event: eventId, affiliate: affiliateId, status: "valid" }) }));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), { locale: "de", eventId, affiliateId, includeDocuments: false });
  assert.equal(received[0].initialStatus, "valid"); assert.equal(received[0].data.participants[0].documentNumber, "");
  assert.equal(html.includes("PRIVATE-SERVER-DOCUMENT"), false); assert.equal(data.participants[0].documentNumber, "PRIVATE-SERVER-DOCUMENT");
});

test("roster route failures expose neither private errors nor reassuring zero totals", async () => {
  const Page = load("app/[locale]/admin/partecipanti/page.tsx", {
    "@/lib/admin/participant-roster": { loadParticipantRosterEvents: async () => { throw new Error("PRIVATE-ERROR"); }, loadParticipantRoster: async input => { assert.equal(input.eventId, "invalid"); throw new Error("PRIVATE-ERROR"); } },
    "./participants-client": { ParticipantsClient: () => React.createElement("p", null, "incorrect data") },
  }).default;
  for (const query of [{}, { event: [eventId, eventId] }]) {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "it" }), searchParams: Promise.resolve(query) }));
    assert.ok(html.includes('role="alert"')); assert.equal(html.includes("PRIVATE-ERROR"), false); assert.equal(html.includes("incorrect data"), false);
  }
});

test("affiliate participant exports preserve affiliate scope and link to the full event roster", () => {
  const { AffiliateParticipantsClient } = load("app/[locale]/admin/affiliati/affiliates-client.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {}, replace() {} }) },
    "@/app/api/admin/affiliati/actions": {}, "@/components/admin/affiliate-wizard": {},
  });
  for (const id of [affiliateId, "direct"]) {
    const html = renderToStaticMarkup(React.createElement(AffiliateParticipantsClient, { event, affiliate: { id, name: "Affiliato", active: true, archived: false }, participants: [], validCount: 0, checkedInCount: 0, totalCount: 0 }));
    const page = new JSDOM(html);
    const download = new URL([...page.window.document.querySelectorAll("a")].find(node => node.textContent === "Esporta CSV completo").getAttribute("href"), "https://meraki.test");
    assert.deepEqual(Object.fromEntries(download.searchParams), { event: eventId, affiliate: id, status: "all", documents: "1" });
    assert.ok(page.window.document.querySelector(`a[href="/admin/partecipanti?event=${eventId}"]`));
    assert.ok(page.window.document.body.textContent.includes("La ricerca nell’elenco non limita l’esportazione"));
    page.window.close();
  }
});

test("check-in page links the selected event to complete export without a check-in mutation", () => {
  const calls = [];
  const { TicketsClient } = load("app/[locale]/admin/biglietti/tickets-client.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {}, replace() {} }) },
    "@/app/api/admin/biglietti/actions": { checkInTicket: () => calls.push("checkin") },
    "@/components/admin/data-table": { DataTable: () => null },
    "@/components/admin/ticket-affiliate-editor": { TicketAffiliateEditor: () => null },
    "./qr-scanner": { QrScanner: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(TicketsClient, { initialTickets: [], initialEventId: eventId, events: [{ id: eventId, titolo: event.title, data_inizio: event.startsAt, activities: [] }] }));
  const page = new JSDOM(html);
  const link = page.window.document.querySelector(`a[href="/admin/partecipanti?event=${eventId}"]`);
  assert.ok(link); assert.ok(link.textContent.includes("Lista completa ed esportazione")); assert.deepEqual(calls, []);
  page.window.close();
});
