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
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, FormData: window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
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
  const loadedModule = { exports: {} };
  vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, URL, window, console, require: name => name in mocks ? mocks[name] : name in nativeFormControlMocks ? nativeFormControlMocks[name] : require(name) });
  return loadedModule.exports;
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
async function setup(context, kind, props, options = {}) {
  window.history.replaceState(null, "", "/it/admin/affiliati?source=events");
  window.document.body.innerHTML = '<div id="root"></div>';
  const navigation = [];
  const component = load("app/[locale]/admin/affiliati/affiliates-client.tsx", {
    "next/navigation": { useRouter: () => ({ replace: (...args) => navigation.push(args), refresh: () => navigation.push(["refresh"]) }) },
    "@/app/api/admin/affiliati/actions": { deleteAffiliate: options.deleteAffiliate || (async () => ({success:true})), restoreAffiliate: options.restoreAffiliate || (async () => ({success:true})) },
    "@/components/admin/affiliate-wizard": { AffiliateWizard: props => React.createElement("section", {"aria-label":"Wizard affiliato"}, React.createElement("button", {onClick: () => props.onSaved({id:affiliateA,name:"Nuova scuola",createdAt:"2026-10-26",deletedAt:null})}, "Salva wizard"), React.createElement("button", {onClick:props.onCancel}, "Annulla wizard")) },
    "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  });
  const Component = kind === "index" ? component.AffiliatesDirectoryClient : kind === "profile" ? component.AffiliateProfileClient : component.AffiliateParticipantsClient;
  if (kind === "index") props = { affiliates: [], ...props };
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
  return { navigation, search, rerender: async next => { await act(async () => root.render(React.createElement(Component, { affiliates: [], ...next }))); } };
}

test("directory groups the same UUID across events and keeps same-name identities distinct", async context => {
  await setup(context, "index", { events: [eventA, eventB], rows: [...rows, row(eventB, affiliateA)], selectedEventId: "", affiliates: [{ id: "new", name: "Scuola appena creata", createdAt: "2026-10-26" }] });
  const links = [...window.document.querySelectorAll('a[aria-label^="Apri fascicolo"]')];
  assert.equal(links.length, 5);
  assert.equal(links.filter(link => link.getAttribute("href") === `/admin/affiliati/${affiliateA}`).length, 1);
  assert.equal(links.filter(link => link.getAttribute("href") === `/admin/affiliati/${affiliateB}`).length, 1);
  assert.ok(links.find(link => link.getAttribute("href") === `/admin/affiliati/${affiliateA}`).textContent.includes("2 eventi associati"));
  assert.ok(links.some(link => link.textContent.includes("Da associare a un evento")));
  assert.equal(window.document.querySelector("video,canvas"), null);
});

test("affiliate search is local and event changes navigate with an explicit event filter", async context => {
  const ui = await setup(context, "index", { events: [eventA, eventB], rows, selectedEventId: "" });
  await ui.search("scuola nuova");
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri fascicolo"]').length, 1);
  assert.ok(window.document.querySelector('[role="status"]').textContent.includes("1 affiliato"));
  const select = window.document.getElementById("affiliates-event");
  await act(async () => { select.value = eventB.id; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  const next = new URL(ui.navigation[0][0], window.location.origin);
  assert.equal(next.pathname, "/it/admin/affiliati");
  assert.equal(next.searchParams.get("event"), eventB.id);
  assert.equal(next.searchParams.get("source"), "events");
  await ui.rerender({ events: [eventA, eventB], rows: [rows[1]], selectedEventId: eventB.id });
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri fascicolo"]').length, 1);
  assert.ok(window.document.querySelector('a[aria-label^="Apri fascicolo"]').textContent.includes(eventB.title));
});

test("empty affiliate lists distinguish no configuration from an unmatched search", async context => {
  const ui = await setup(context, "index", { events: [], rows: [], selectedEventId: "" });
  assert.ok(window.document.body.textContent.includes("La tua rete di affiliati parte da qui."));
  await ui.search("non presente");
  assert.ok(window.document.body.textContent.includes("Nessun affiliato corrisponde alla ricerca."));
});

test("directory opens setup wizard and adds the saved dossier immediately", async context => {
  await setup(context, "index", { events: [eventA], rows: [], affiliates: [], selectedEventId: "" });
  const open = () => [...window.document.querySelectorAll("button")].find(button => button.textContent === "Nuovo affiliato");
  await act(async () => open().click());
  assert.ok(window.document.querySelector('[aria-label="Wizard affiliato"]'));
  await act(async () => [...window.document.querySelectorAll("button")].find(button => button.textContent === "Salva wizard").click());
  assert.ok(window.document.querySelector(`a[aria-label="Apri fascicolo di Nuova scuola"][href="/admin/affiliati/${affiliateA}"]`));
  assert.ok(window.document.body.textContent.includes("affiliato creato"));
  assert.equal(window.document.activeElement, open());
});

test("trash filter hides deleted affiliates even with historical event rows and exposes their dossiers", async context => {
  await setup(context,"index",{events:[eventA],rows:[row(eventA,affiliateA)],selectedEventId:"",affiliates:[{id:affiliateA,name:"Nel cestino",createdAt:"2026-10-26",deletedAt:"2026-10-26"},{id:affiliateB,name:"Attivo",createdAt:"2026-10-26"}]});
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri fascicolo"]').length,1);
  assert.ok(window.document.querySelector('a[aria-label="Apri fascicolo di Attivo"]'));
  await act(async () => [...window.document.querySelectorAll("button")].find(button => button.textContent.includes("Cestino (1)")).click());
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri fascicolo"]').length,1);
  assert.ok(window.document.querySelector('a[aria-label="Apri fascicolo di Nel cestino"]'));
});

test("dossier deletion requires its inline confirmation and can be restored with history retained", async context => {
  const calls=[];
  await setup(context,"profile",{affiliate,rows:[row(eventA,affiliateA)],events:[eventA]}, {deleteAffiliate:async id=>{calls.push(["delete",id]);return{success:true};},restoreAffiliate:async id=>{calls.push(["restore",id]);return{success:true};}});
  const button=label=>[...window.document.querySelectorAll("button")].find(node=>node.textContent===label);
  await act(async()=>button("Elimina affiliato").click());
  assert.equal(calls.length,0);
  assert.ok(window.document.querySelector('[aria-label="Conferma eliminazione affiliato"]'));
  await act(async()=>button("Sposta nel cestino").click());
  assert.deepEqual(calls,[["delete",affiliateA]]);
  assert.ok(button("Ripristina affiliato"));
  assert.ok(window.document.querySelector(`a[href="/admin/affiliati/${affiliateA}?event=${eventA.id}"]`));
  await act(async()=>button("Ripristina affiliato").click());
  assert.deepEqual(calls,[["delete",affiliateA],["restore",affiliateA]]);
  assert.ok(button("Modifica affiliato"));
});

test("failed dossier deletion shows the error and keeps restore unavailable", async context => {
  await setup(context,"profile",{affiliate,rows:[],events:[]},{deleteAffiliate:async()=>({success:false,error:"Operazione non disponibile."})});
  const button=label=>[...window.document.querySelectorAll("button")].find(node=>node.textContent===label);
  await act(async()=>button("Elimina affiliato").click());
  await act(async()=>button("Sposta nel cestino").click());
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("Operazione non disponibile"));
  assert.equal(button("Ripristina affiliato"),undefined);
});

test("profile searches events while retaining complete totals and historical events", async context => {
  const ui = await setup(context, "profile", { affiliate, rows: [row(eventA, affiliateA), row(eventB, affiliateA, { active: false })] });
  assert.ok(window.document.body.textContent.includes("Disabilitato"));
  const before = [...window.document.querySelectorAll("dl:first-of-type dd")].map(item => item.textContent);
  await ui.search("estate");
  assert.equal(window.document.querySelectorAll('a[aria-label^="Apri iscritti"]').length, 1);
  assert.equal(window.document.querySelector('a[aria-label^="Apri iscritti"]').getAttribute("href"), `/admin/affiliati/${affiliateA}?event=${eventB.id}`);
  assert.deepEqual([...window.document.querySelectorAll("dl:first-of-type dd")].slice(0, 3).map(item => item.textContent), before.slice(0, 3));
});

test("directory and dossier keep euro and credit earnings separate across events", async context => {
  const mixed = [row(eventA, affiliateA), row(eventB, affiliateA, { commissionType: "credits", commissionPerParticipantCents: 0, commissionPerParticipantCredits: 3, commissionCredits: 6 })];
  const ui = await setup(context, "index", { events: [eventA, eventB], rows: mixed, selectedEventId: "" });
  const earned = [...window.document.querySelectorAll("dt")].find(node => node.textContent === "Compenso maturato").nextElementSibling;
  assert.match(earned.textContent, /10,00\s*€/);
  assert.match(earned.textContent, /6 crediti/);
  const profileLink = window.document.querySelector(`a[href="/admin/affiliati/${affiliateA}"]`);
  assert.match(profileLink.textContent, /6 crediti/);
  await ui.search("estate");
  assert.match(earned.textContent, /6 crediti/, "search does not change the total");
});

test("credit dossier shows its default and per-event rate without a euro conversion", async context => {
  await setup(context, "profile", { affiliate: { ...affiliate, defaultCommissionType: "credits", defaultCommissionCredits: 2, defaultCommissionCents: 0 }, rows: [row(eventA, affiliateA, { commissionType: "credits", commissionPerParticipantCents: 0, commissionPerParticipantCredits: 2, commissionCredits: 4 })] });
  const valueFor = label => [...window.document.querySelectorAll("dt")].find(node => node.textContent === label).nextElementSibling.textContent;
  assert.equal(valueFor("Compenso predefinito per iscritto"), "2 crediti");
  assert.match(valueFor("Compenso maturato"), /^4 crediti/);
  assert.equal(valueFor("Compenso per iscritto valido"), "2 crediti");
  assert.equal(window.document.body.textContent.includes("€"), false);
});

test("participant list calculates credits for valid participants with the correct unit", async context => {
  await setup(context, "detail", { event: eventA, affiliate: { ...affiliate, commissionType: "credits", commissionPerParticipantCents: 0, commissionCents: 0, commissionPerParticipantCredits: 1, commissionCredits: 1 }, participants, validCount: 1, checkedInCount: 1, totalCount: 2 });
  assert.match(window.document.body.textContent, /1 iscritto valido × 1 credito = 1 credito\./);
  assert.equal(window.document.body.textContent.includes("€"), false);
});

test("an affiliate detail searches participants without changing totals and preserves event scope in back/check-in links", async context => {
  const ui = await setup(context, "detail", { event: eventA, affiliate, participants, validCount: 1, checkedInCount: 1, totalCount: 2 });
  const links = [...window.document.querySelectorAll("a")];
  assert.ok(links.some(link => link.getAttribute("href") === `/admin/affiliati/${affiliateA}`));
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
  assert.ok(window.document.body.textContent.includes("Disabilitato"));
});

test("async route adapters forward explicit event/affiliate scope and never turn unknown details into a broader list", async () => {
  const calls = [];
  const clients = { AffiliatesDirectoryClient: props => React.createElement("p", null, `directory:${props.selectedEventId}`), AffiliateParticipantsClient: props => React.createElement("p", null, `detail:${props.affiliate.name}`) };
  const mocks = { "@/lib/events/affiliate-registry": { loadAffiliateRegistry: async () => [] }, "./affiliates-client": clients, "../affiliates-client": clients, "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } }, "@/lib/events/affiliate-directory": {
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
  const mocks = { "@/lib/events/affiliate-registry": { loadAffiliateRegistry: error }, "./affiliates-client": {}, "../affiliates-client": {}, "next/navigation": {}, "@/lib/events/affiliate-directory": { loadAffiliateDirectory: error, loadAffiliateParticipants: error } };
  for (const [path, params] of [["page.tsx", { locale: "it" }], ["[id]/page.tsx", { locale: "it", id: affiliateA }]]) {
    const page = load(`app/[locale]/admin/affiliati/${path}`, mocks).default;
    const html = renderToStaticMarkup(await page({ params: Promise.resolve(params), searchParams: Promise.resolve({ event: eventA.id }) }));
    assert.ok(html.includes('role="alert"'));
    assert.equal(html.includes("private-participant"), false);
  }
});

test("affiliate route without event opens a dossier and rejects ambiguous event parameters", async () => {
  const calls = [];
  const page = load("app/[locale]/admin/affiliati/[id]/page.tsx", {
    "../affiliates-client": { AffiliateProfileClient: props => React.createElement("p", null, `profile:${props.affiliate.name}`) },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/lib/events/affiliate-directory": {
      loadAffiliateProfile: async (...args) => { calls.push(args); return { affiliate, rows: [] }; },
      loadAffiliateParticipants: async (_locale, event) => { assert.equal(event, ""); return null; },
    },
  }).default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ locale: "it", id: affiliateA }), searchParams: Promise.resolve({}) }));
  assert.ok(html.includes(`profile:${affiliate.name}`));
  assert.deepEqual(calls, [["it", affiliateA]]);
  await assert.rejects(page({ params: Promise.resolve({ locale: "it", id: affiliateA }), searchParams: Promise.resolve({ event: [eventA.id, eventB.id] }) }), /NOT_FOUND/);
});

test("profile shows event-specific compensation and links each event to its scoped participants", async context => {
  await setup(context, "profile", { affiliate, rows: [row(eventA, affiliateA, { validCount: 8, totalCount: 9 }), row(eventB, affiliateA, { commissionPerParticipantCents: 0 })] });
  const entries = [...window.document.querySelectorAll('section[aria-labelledby="affiliate-events-title"] > ul > li')];
  assert.equal(entries[0].querySelector('a[aria-label^="Apri iscritti"]').getAttribute("href"), `/admin/affiliati/${affiliateA}?event=${eventA.id}`);
  assert.ok(entries[0].textContent.includes("20/12/2026"));
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
