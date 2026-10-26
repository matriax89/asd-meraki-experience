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

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/affiliati", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, URL, window, console, require: name => name in mocks ? mocks[name] : name in nativeFormControlMocks ? nativeFormControlMocks[name] : require(name) });
  return module.exports;
}
const eventA = { id: "b44b9ba0-11cc-4da7-80d0-a3acf193c379", title: "Meraki Inverno", startsAt: "2026-12-19T23:30:00Z" };
const eventB = { id: "c732f0f8-fb0d-45fe-8e49-cdc1d8cc8d02", title: "Meraki Estate", startsAt: "2027-06-01T10:00:00Z" };
const affiliateA = "8af0ff53-de24-43b5-a8f0-1c29d11ca936";
const affiliateB = "c66f0bf0-9ff0-4fd5-825e-e2bb28cd301a";
const affiliate = { id: affiliateA, name: "Martina Gallo", active: true, archived: false, commissionPerParticipantCents: 500, commissionCents: 500 };
const row = (event, id, overrides = {}) => {
  const entry = { eventId: event.id, eventTitle: event.title, eventStartsAt: event.startsAt, affiliateId: id, name: "Martina Gallo", active: true, archived: false, validCount: 2, checkedInCount: 1, totalCount: 3, commissionPerParticipantCents: 500, ...overrides };
  return { ...entry, commissionCents: entry.validCount * entry.commissionPerParticipantCents };
};
const rows = [row(eventA, affiliateA), row(eventB, affiliateB), row(eventA, "archived", { name: "Scuola storica", active: false, archived: true, validCount: 0, totalCount: 1 }), row(eventA, "empty", { name: "Scuola nuova", active: false, validCount: 0, totalCount: 0 })];
const participants = [
  { id: "ada", name: "Ada Rossi", email: "ada@example.test", packageName: "Workshop + Masterclass", status: "paid", checkedIn: true, activities: [{ id: "right-ws", name: "Workshop", status: "used", checkedInAt: "2026-12-20T00:00:00Z", menuChoice: null }] },
  { id: "rita", name: "Rita Bianchi", email: "rita@example.test", packageName: "Masterclass", status: "refunded", checkedIn: false, activities: [{ id: "right-mc", name: "Masterclass", status: "refunded", checkedInAt: null, menuChoice: null }] },
];
async function setup(context, kind, props) {
  window.history.replaceState(null, "", "/it/admin/affiliati?source=events");
  window.document.body.innerHTML = '<div id="root"></div>';
  const navigation = [];
  const component = load("app/[locale]/admin/affiliati/affiliates-client.tsx", {
    "next/navigation": { useRouter: () => ({ replace: (...args) => navigation.push(args) }) },
    "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  });
  const Component = kind === "index" ? component.AffiliatesDirectoryClient : component.AffiliateParticipantsClient;
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(Component, props)));
  context.after(async () => { await act(async () => root.unmount()); });
  const search = async value => {
    const input = window.document.querySelector('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  return { navigation, search, rerender: async next => { await act(async () => root.render(React.createElement(Component, next))); } };
}

test("affiliate directory keeps same-name affiliates separate by event and opens the exact participant list", async context => {
  await setup(context, "index", { events: [eventA, eventB], rows, selectedEventId: "" });
  const links = [...window.document.querySelectorAll('a[aria-label^="Apri iscritti"]')];
  assert.equal(links.length, 4);
  assert.equal(links[0].getAttribute("href"), `/admin/affiliati/${affiliateA}?event=${eventA.id}`);
  assert.equal(links[1].getAttribute("href"), `/admin/affiliati/${affiliateB}?event=${eventB.id}`);
  assert.ok(links[0].textContent.includes("20/12/2026"), "show the Rome calendar day");
  assert.ok(window.document.body.textContent.includes("Archiviato"));
  assert.ok(window.document.body.textContent.includes("Disattivato"));
  assert.ok(window.document.body.textContent.includes("0 iscritti validi"));
  assert.equal(window.document.querySelector("video,canvas"), null);
});

test("affiliate search is local and event changes navigate with an explicit event filter", async context => {
  const ui = await setup(context, "index", { events: [eventA, eventB], rows, selectedEventId: "" });
  await ui.search("scuola nuova");
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri iscritti"]').length, 1);
  assert.ok(window.document.querySelector('[role="status"]').textContent.includes("1 elenco disponibile"));
  const select = window.document.getElementById("affiliates-event");
  await act(async () => { select.value = eventB.id; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  const next = new URL(ui.navigation[0][0], window.location.origin);
  assert.equal(next.pathname, "/it/admin/affiliati");
  assert.equal(next.searchParams.get("event"), eventB.id);
  assert.equal(next.searchParams.get("source"), "events");
  await ui.rerender({ events: [eventA, eventB], rows: [rows[1]], selectedEventId: eventB.id });
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri iscritti"]').length, 1);
  assert.ok(window.document.querySelector('a[aria-label^="Apri iscritti"]').textContent.includes(eventB.title));
});

test("empty affiliate lists distinguish no configuration from an unmatched search", async context => {
  const ui = await setup(context, "index", { events: [], rows: [], selectedEventId: "" });
  assert.ok(window.document.body.textContent.includes("Non ci sono affiliati per questo elenco."));
  await ui.search("non presente");
  assert.ok(window.document.body.textContent.includes("Nessun affiliato corrisponde alla ricerca."));
});

test("an affiliate detail searches participants without changing totals and preserves event scope in back/check-in links", async context => {
  const ui = await setup(context, "detail", { event: eventA, affiliate, participants, validCount: 1, checkedInCount: 1, totalCount: 2 });
  const links = [...window.document.querySelectorAll("a")];
  assert.ok(links.some(link => link.getAttribute("href") === `/admin/affiliati?event=${eventA.id}`));
  assert.ok(links.some(link => link.getAttribute("href") === `/admin/biglietti?event=${eventA.id}&affiliate=${affiliateA}`));
  assert.ok(window.document.body.textContent.includes("Rimborsato"));
  assert.ok(window.document.body.textContent.includes("Check-in non disponibile"));
  const countsBefore = [...window.document.querySelectorAll("dd")].map(node => node.textContent);
  await ui.search("rita@example");
  assert.equal(window.document.querySelectorAll("h2").length, 1);
  assert.equal(window.document.querySelector("h2").textContent, "Rita Bianchi");
  assert.deepEqual([...window.document.querySelectorAll("dd")].map(node => node.textContent), countsBefore);
  assert.equal(window.document.querySelector("button,video,canvas"), null, "this list has no admission action or camera");
  await ui.search("missing");
  assert.ok(window.document.body.textContent.includes("Nessun partecipante corrisponde alla ricerca."));
});

test("configured affiliates with no participants still show a scoped empty detail", async context => {
  await setup(context, "detail", { event: eventA, affiliate: { ...affiliate, active: false }, participants: [], validCount: 0, checkedInCount: 0, totalCount: 0 });
  assert.ok(window.document.body.textContent.includes("Non ci sono ancora iscritti per questo affiliato."));
  assert.ok(window.document.body.textContent.includes("Disattivato"));
});

test("async route adapters forward explicit event/affiliate scope and never turn unknown details into a broader list", async () => {
  const calls = [];
  const clients = { AffiliatesDirectoryClient: props => React.createElement("p", null, `directory:${props.selectedEventId}`), AffiliateParticipantsClient: props => React.createElement("p", null, `detail:${props.affiliate.name}`) };
  const mocks = { "./affiliates-client": clients, "../affiliates-client": clients, "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } }, "@/lib/events/affiliate-directory": {
    loadAffiliateDirectory: async (...args) => { calls.push(["index", ...args]); return { events: [], rows: [], selectedEventId: args[1] || "" }; },
    loadAffiliateParticipants: async (...args) => { calls.push(["detail", ...args]); return args[2] === "missing" ? null : { event: eventA, affiliate, participants: [], validCount: 0, checkedInCount: 0, totalCount: 0 }; },
  } };
  const index = load("app/[locale]/admin/affiliati/page.tsx", mocks).default;
  const detail = load("app/[locale]/admin/affiliati/[id]/page.tsx", mocks).default;
  assert.ok(renderToStaticMarkup(await index({ params: Promise.resolve({ locale: "de" }), searchParams: Promise.resolve({ event: eventA.id }) })).includes(eventA.id));
  assert.ok(renderToStaticMarkup(await detail({ params: Promise.resolve({ locale: "it", id: affiliateA }), searchParams: Promise.resolve({ event: eventA.id }) })).includes(affiliate.name));
  assert.deepEqual(calls, [["index", "de", eventA.id], ["detail", "it", eventA.id, affiliateA]]);
  await assert.rejects(detail({ params: Promise.resolve({ locale: "it", id: "missing" }), searchParams: Promise.resolve({ event: eventA.id }) }), /NOT_FOUND/);
});

test("route failures display an error without leaking private records or exception contents", async () => {
  const error = async () => { throw new Error("private-participant@example.test"); };
  const mocks = { "./affiliates-client": {}, "../affiliates-client": {}, "next/navigation": {}, "@/lib/events/affiliate-directory": { loadAffiliateDirectory: error, loadAffiliateParticipants: error } };
  for (const [path, params] of [["page.tsx", { locale: "it" }], ["[id]/page.tsx", { locale: "it", id: affiliateA }]]) {
    const page = load(`app/[locale]/admin/affiliati/${path}`, mocks).default;
    const html = renderToStaticMarkup(await page({ params: Promise.resolve(params), searchParams: Promise.resolve({ event: eventA.id }) }));
    assert.ok(html.includes('role="alert"'));
    assert.equal(html.includes("private-participant"), false);
  }
});

test("directory shows event-specific rate and earned compensation outside the participant-list link", async context => {
  await setup(context, "index", { events: [eventA], rows: [row(eventA, affiliateA, { validCount: 8, totalCount: 9 }), row(eventA, affiliateB, { name: "Scuola senza compenso", commissionPerParticipantCents: 0 })], selectedEventId: eventA.id });
  const entries = [...window.document.querySelectorAll('section[aria-label="Elenco affiliati"] > ul > li')];
  assert.ok(entries[0].textContent.includes("8 iscritti validi"));
  assert.ok(entries[0].textContent.includes("5,00")); assert.ok(entries[0].textContent.includes("40,00"));
  assert.ok(entries[0].textContent.includes("Compenso maturato"));
  const settings = entries[0].querySelector('a[aria-label^="Imposta compenso"]');
  assert.equal(settings.getAttribute("href"), `/admin/eventi/${eventA.id}#compensi-affiliati`);
  assert.equal(settings.parentElement.closest("a"), null, "settings link cannot be nested in the participant link");
  assert.ok(entries[1].textContent.includes("0,00"));
  assert.equal(window.document.body.textContent.includes("NaN"), false);
});

test("detail compensation uses valid totals and survives participant search", async context => {
  const ui = await setup(context, "detail", { event: eventA, affiliate: { ...affiliate, commissionCents: 4000 }, participants, validCount: 8, checkedInCount: 1, totalCount: 9 });
  const value = label => [...window.document.querySelectorAll("dt")].find(node => node.textContent === label)?.nextElementSibling?.textContent;
  assert.ok(value("Compenso per iscritto valido").includes("5,00"));
  assert.ok(value("Compenso maturato").includes("40,00"));
  assert.ok(window.document.querySelector(`a[href="/admin/eventi/${eventA.id}#compensi-affiliati"]`));
  await ui.search("rita");
  assert.ok(value("Compenso maturato").includes("40,00"));
});

test("direct purchases never display payable compensation or an edit-compensation link", async context => {
  await setup(context, "detail", { event: eventA, affiliate: { ...affiliate, id: "direct", name: "Acquisti diretti", commissionPerParticipantCents: 0, commissionCents: 0 }, participants, validCount: 1, checkedInCount: 1, totalCount: 2 });
  assert.ok(window.document.body.textContent.includes("Nessun compenso per gli acquisti diretti."));
  assert.equal(window.document.body.textContent.includes("Compenso maturato"), false);
  assert.equal(window.document.querySelector('a[href$="#compensi-affiliati"]'), null);
});
