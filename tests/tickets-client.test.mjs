import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import ts from "typescript";
import { nativeFormControlMocks } from "./helpers/native-form-controls.mjs";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/biglietti", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
window.HTMLMediaElement.prototype.pause = function () {};
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const eventA = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const eventB = "f0c59975-552a-4471-bc3b-fb1940bc81ab";
const events = [
  { id: eventA, titolo: "Meraki Workshop", data_inizio: "2026-11-18T23:30:00Z", activities: [{ id: "workshop", name: "Workshop" }, { id: "masterclass", name: "Masterclass" }, { id: "dinner", name: "Cena" }] },
  { id: eventB, titolo: "Meraki Estate", data_inizio: "2027-06-01T17:00:00Z", activities: [] },
];
const entitlement = (id, name, extra = {}) => ({ activity_id: id, activity_name: name, status: "valid", checked_in_at: null, menu_choice: null, ...extra });
const tickets = [
  { id: "ada", event_id: eventA, buyer_nome: "Ada", buyer_cognome: "Rossi", buyer_email: "ada@example.test", qr_code: "ada_opaque", status: "paid", used_at: null, commerce: true, package_name: "Workshop + cena", entitlements: [entitlement("workshop", "Workshop"), entitlement("dinner", "Cena", { menu_choice: "Vegetariano" })], events: events[0] },
  { id: "edo", event_id: eventA, buyer_nome: "Edo", buyer_cognome: "Bianchi", buyer_email: "edo@example.test", qr_code: "edo_opaque", status: "paid", used_at: null, commerce: true, entitlements: [entitlement("workshop", "Workshop")], events: events[0] },
  { id: "luca", event_id: eventA, buyer_nome: "Luca", buyer_cognome: "Verdi", buyer_email: "luca@example.test", qr_code: "luca_opaque", status: "used", used_at: "2026-11-19T00:00:00Z", events: events[0] },
  { id: "nina", event_id: eventA, buyer_nome: "Nina", buyer_cognome: "Blu", buyer_email: "nina@example.test", qr_code: "nina_opaque", status: "paid", used_at: null, events: events[0] },
  { id: "refunded", event_id: eventA, buyer_nome: "Rita", buyer_cognome: "Viola", buyer_email: "rita@example.test", qr_code: "refunded_opaque", status: "refunded", used_at: null, events: events[0] },
  { id: "pending", event_id: eventA, buyer_nome: "Pino", buyer_cognome: "Gialli", buyer_email: "pino@example.test", qr_code: "pending_opaque", status: "pending", used_at: null, events: events[0] },
  { id: "bruno", event_id: eventB, buyer_nome: "Bruno", buyer_cognome: "Neri", buyer_email: "bruno@example.test", qr_code: "bruno_opaque", status: "paid", used_at: null, events: events[1] },
];

function compile(path, replacements) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, window, document: window.document, navigator: window.navigator, URL, Error, console, require: (name) => replacements[name] || nativeFormControlMocks[name] || (name === "@/lib/events/affiliates" ? compile("../src/lib/events/affiliates.ts", {}) : require(name)) });
  return exports;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function setup(context, { initialEventId = "", initialAffiliateId = "", ticketRows = tickets, eventRows = events, url = "/it/admin/biglietti?source=events#iscritti" } = {}) {
  window.history.replaceState(null, "", url);
  window.document.body.innerHTML = '<div id="tickets-root"></div>';
  const actionCalls = [];
  const qrCalls = [];
  const mediaRequests = [];
  const authorizationCalls = [];
  const decoders = [];
  const navigationCalls = [];
  const storedTickets = structuredClone(ticketRows);
  const actions = {
    checkInTicket(id, selectedEvent, activityId) {
      const pending = deferred();
      actionCalls.push({ ...pending, id, eventId: selectedEvent, activityId });
      return pending.promise;
    },
    checkInQrCode(code, selectedEvent, activityId) {
      const pending = deferred();
      qrCalls.push({ ...pending, code, eventId: selectedEvent, activityId });
      return pending.promise;
    },
    async checkInCameraAccess() { authorizationCalls.push(true); return { allowed: true }; },
  };
  Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: { async getUserMedia() {
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    const stream = { getTracks: () => [track] };
    mediaRequests.push({ track, stream });
    return stream;
  } } });
  class BrowserQRCodeReader {
    async decodeFromStream(stream, video, callback) {
      video.srcObject = stream;
      const controls = { stop() {} };
      decoders.push({ callback, controls });
      return controls;
    }
  }
  const scanner = compile("../src/app/[locale]/admin/biglietti/qr-scanner.tsx", { "@/app/api/admin/biglietti/actions": actions, "@zxing/browser": { BrowserQRCodeReader } });
  const dataTable = compile("../src/components/admin/data-table.tsx", { "./data-table-view": compile("../src/components/admin/data-table-view.tsx", {}) });
  const router = { replace(href, options) {
    navigationCalls.push({ href, options });
    window.history.replaceState(null, "", href);
    const selected = new URL(window.location.href).searchParams.get("event") || "";
    render(selected);
  } };
  const { TicketsClient } = compile("../src/app/[locale]/admin/biglietti/tickets-client.tsx", { "next/navigation": { useRouter: () => router }, "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) }, "@/app/api/admin/biglietti/actions": actions, "@/components/admin/data-table": dataTable, "./qr-scanner": scanner });
  const root = createRoot(window.document.getElementById("tickets-root"));
  const render = (id) => root.render(React.createElement(TicketsClient, { initialTickets: storedTickets.filter((ticket) => ticket.event_id === id), events: eventRows, initialEventId: id, initialAffiliateId: new URL(window.location.href).searchParams.get("affiliate") || initialAffiliateId }));
  context.after(async () => { await act(async () => root.unmount()); });
  await act(async () => render(initialEventId));
  const rows = () => [...window.document.querySelectorAll("tbody tr")];
  const row = (name) => rows().find((element) => element.textContent.includes(name));
  const button = (name, parent = window.document) => [...parent.querySelectorAll("button")].find((element) => element.textContent.includes(name));
  const select = async (element, value) => { assert.ok(element); await act(async () => { element.value = value; element.dispatchEvent(new window.Event("change", { bubbles: true })); }); };
  const selectEvent = (id) => select(window.document.getElementById("tickets-event"), id);
  const search = async (value) => {
    const element = window.document.querySelector('[aria-label="Cerca nome, email o codice"]');
    assert.ok(element);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
      element.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const counts = () => Object.fromEntries([...window.document.querySelectorAll("dl > div")].map((element) => [element.querySelector("dt").textContent.trim(), Number(element.querySelector("dd").textContent)]));
  const respond = async (result) => {
    if (result.ticket) Object.assign(storedTickets.find((ticket) => ticket.id === result.ticket.id), result.ticket);
    await act(async () => actionCalls.at(-1).resolve(result));
  };
  return { actionCalls, qrCalls, mediaRequests, authorizationCalls, decoders, navigationCalls, rows, row, button, select, selectEvent, search, counts, respond };
}

test("the participant list requires an explicit event and keeps the URL event filter", async (context) => {
  const ui = await setup(context);
  assert.equal(window.document.querySelector("table"), null);
  assert.equal(window.document.querySelector("video"), null);
  assert.match(window.document.body.textContent, /Seleziona un evento per vedere gli iscritti/);
  await ui.selectEvent(eventA);
  assert.equal(ui.rows().length, 6);
  assert.equal(window.document.querySelector('a[href^="/admin/affiliati"]').getAttribute("href"), `/admin/affiliati?event=${eventA}`);
  assert.ok(ui.row("Ada Rossi"));
  assert.equal(ui.row("Bruno Neri"), undefined);
  assert.equal(new URL(window.location.href).searchParams.get("event"), eventA);
  assert.equal(new URL(window.location.href).searchParams.get("source"), "events");
  assert.equal(window.location.hash, "#iscritti");
  assert.equal(ui.navigationCalls[0].options.scroll, false);
  assert.equal(window.document.getElementById("check-in-event").value, eventA);
  assert.equal(ui.mediaRequests.length, 0);
  assert.equal(ui.authorizationCalls.length, 0);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 1, "Senza check-in": 3 });
  await ui.selectEvent(eventB);
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.row("Bruno Neri"));
  assert.deepEqual(ui.counts(), { "Iscritti validi": 1, "Con check-in": 0, "Senza check-in": 1 });
  assert.equal(window.document.getElementById("check-in-event").value, eventB);
  await ui.selectEvent("");
  assert.equal(new URL(window.location.href).searchParams.has("event"), false);
  assert.equal(window.document.querySelector("table"), null);
  assert.equal(window.document.querySelector("video"), null);
});

test("a valid initial event opens its participant list with the camera off", async (context) => {
  const ui = await setup(context, { initialEventId: eventB, url: `/it/admin/biglietti?event=${eventB}` });
  assert.equal(window.document.getElementById("tickets-event").value, eventB);
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.row("Bruno Neri"));
  assert.equal(window.document.getElementById("check-in-event").value, eventB);
  assert.equal(ui.mediaRequests.length, 0);
  assert.equal(ui.qrCalls.length, 0);
});

test("an unknown initial event cannot expose a global list or initialize a scanner", async (context) => {
  const ui = await setup(context, { initialEventId: "unknown" });
  assert.equal(window.document.getElementById("tickets-event").value, "");
  assert.equal(window.document.querySelector("table"), null);
  assert.equal(window.document.querySelector("video"), null);
  assert.equal(ui.mediaRequests.length, 0);
});

test("search finds a full name, email or ticket code only inside the selected event", async (context) => {
  const ui = await setup(context, { initialEventId: eventA });
  for (const query of ["ADA ROSSI", "ada@example", "ada_opaque"]) {
    await ui.search(query);
    assert.equal(ui.rows().length, 1);
    assert.ok(ui.row("Ada Rossi"));
    assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 1, "Senza check-in": 3 });
  }
  await ui.search("bruno");
  assert.match(window.document.querySelector("tbody").textContent, /Non ci sono ancora dati/);
  assert.equal(ui.row("Bruno Neri"), undefined);
  await ui.selectEvent(eventB);
  assert.equal(window.document.querySelector('[aria-label="Cerca nome, email o codice"]').value, "");
  assert.ok(ui.row("Bruno Neri"));
});

test("manual legacy admission submits once, updates event counts and never requests the camera", async (context) => {
  const ui = await setup(context, { initialEventId: eventA });
  const button = ui.button("Registra ingresso", ui.row("Nina Blu"));
  await act(async () => { button.click(); button.click(); });
  assert.equal(ui.actionCalls.length, 1);
  assert.equal(ui.actionCalls[0].id, "nina");
  assert.equal(ui.actionCalls[0].eventId, eventA);
  assert.equal(ui.actionCalls[0].activityId, undefined);
  assert.equal(window.document.getElementById("tickets-event").disabled, true);
  assert.equal(ui.mediaRequests.length, 0);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 1, "Senza check-in": 3 });
  await ui.respond({ outcome: "admitted", message: "Ingresso confermato per Nina.", ticket: { id: "nina", event_id: eventA, buyer_nome: "Nina", buyer_cognome: "Blu", status: "used", used_at: "2026-11-19T00:30:00Z" } });
  assert.match(window.document.body.textContent, /Ingresso confermato per Nina/);
  assert.equal(ui.button("Registra ingresso", ui.row("Nina Blu")), undefined);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 2, "Senza check-in": 2 });
  assert.equal(ui.mediaRequests.length, 0);
  assert.equal(ui.authorizationCalls.length, 0);
  await ui.selectEvent(eventB);
  await ui.selectEvent(eventA);
  assert.equal(ui.button("Registra ingresso", ui.row("Nina Blu")), undefined);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 2, "Senza check-in": 2 });
});

test("each participant selects only their actual included activities and each admission consumes one access", async (context) => {
  const ui = await setup(context, { initialEventId: eventA });
  const adaActivity = ui.row("Ada Rossi").querySelector("select");
  assert.deepEqual([...adaActivity.options].map((entry) => entry.value), ["", "workshop", "dinner"]);
  assert.match(ui.row("Ada Rossi").textContent, /Menu: Vegetariano/);
  assert.equal(ui.button("Registra attività", ui.row("Ada Rossi")).disabled, true);
  await ui.select(adaActivity, "workshop");
  assert.equal(ui.button("Registra attività", ui.row("Ada Rossi")).disabled, false);
  assert.equal(ui.button("Registra attività", ui.row("Edo Bianchi")).disabled, true);
  await act(async () => ui.button("Registra attività", ui.row("Ada Rossi")).click());
  assert.equal(ui.actionCalls[0].id, "ada");
  assert.equal(ui.actionCalls[0].eventId, eventA);
  assert.equal(ui.actionCalls[0].activityId, "workshop");
  const rights = [entitlement("workshop", "Workshop", { status: "used", checked_in_at: "2026-11-19T00:30:00Z" }), entitlement("dinner", "Cena", { menu_choice: "Vegetariano" })];
  await ui.respond({ outcome: "admitted", message: "Workshop confermato.", ticket: { id: "ada", event_id: eventA, buyer_nome: "Ada", buyer_cognome: "Rossi", status: "paid", used_at: "2026-11-19T00:30:00Z", commerce: true, entitlements: rights } });
  assert.equal(ui.button("Registra attività", ui.row("Ada Rossi")).disabled, true);
  assert.equal(ui.row("Ada Rossi").querySelector('option[value="workshop"]').disabled, true);
  assert.equal(ui.row("Ada Rossi").querySelector('option[value="dinner"]').disabled, false);
  assert.match(ui.row("Ada Rossi").textContent, /Check-in registrato/);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 2, "Senza check-in": 2 });
  await ui.select(ui.row("Ada Rossi").querySelector("select"), "dinner");
  await act(async () => ui.button("Registra attività", ui.row("Ada Rossi")).click());
  assert.equal(ui.actionCalls[1].activityId, "dinner");
  await ui.respond({ outcome: "admitted", message: "Cena confermata.", ticket: { id: "ada", event_id: eventA, buyer_nome: "Ada", buyer_cognome: "Rossi", status: "used", used_at: "2026-11-19T19:00:00Z", commerce: true, entitlements: rights.map((right) => ({ ...right, status: "used", checked_in_at: right.checked_in_at || "2026-11-19T19:00:00Z" })) } });
  assert.equal(ui.button("Registra attività", ui.row("Ada Rossi")), undefined);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 2, "Senza check-in": 2 });
  assert.equal(ui.mediaRequests.length, 0);
  assert.equal(ui.qrCalls.length, 0);
});

test("pending and refunded tickets cannot be admitted and a connection failure never changes counts", async (context) => {
  const ui = await setup(context, { initialEventId: eventA });
  assert.equal(ui.row("Rita Viola").querySelector("button"), null);
  assert.equal(ui.row("Pino Gialli").querySelector("button"), null);
  await act(async () => ui.button("Registra ingresso", ui.row("Nina Blu")).click());
  await act(async () => ui.actionCalls[0].reject(new Error("Offline")));
  assert.match(window.document.body.textContent, /Il check-in non è confermato/);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 1, "Senza check-in": 3 });
  assert.equal(ui.button("Registra ingresso", ui.row("Nina Blu")).disabled, false);
  assert.equal(ui.mediaRequests.length, 0);
});

test("an admission already recorded by another operator updates the list without authorizing another entry", async (context) => {
  const ui = await setup(context, { initialEventId: eventA });
  await act(async () => ui.button("Registra ingresso", ui.row("Nina Blu")).click());
  await ui.respond({ outcome: "already_used", message: "Biglietto già utilizzato. Non autorizzare un secondo ingresso.", ticket: { id: "nina", event_id: eventA, buyer_nome: "Nina", buyer_cognome: "Blu", status: "used", used_at: "2026-11-19T00:30:00Z" } });
  assert.match(window.document.body.textContent, /Non autorizzare un secondo ingresso/);
  assert.equal(ui.button("Registra ingresso", ui.row("Nina Blu")), undefined);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 4, "Con check-in": 2, "Senza check-in": 2 });
  assert.equal(ui.mediaRequests.length, 0);
});

test("a QR result updates the same event list and table interactions never unlock a new camera reading", async (context) => {
  const ui = await setup(context, { initialEventId: eventB });
  await act(async () => ui.button("Attiva fotocamera").click());
  await act(async () => ui.decoders[0].callback({ getText: () => "bruno_opaque" }, undefined, ui.decoders[0].controls));
  assert.equal(ui.mediaRequests[0].track.readyState, "ended");
  assert.equal(ui.qrCalls[0].eventId, eventB);
  await act(async () => ui.qrCalls[0].resolve({ outcome: "admitted", message: "Ingresso QR confermato.", ticket: { id: "bruno", event_id: eventB, buyer_nome: "Bruno", buyer_cognome: "Neri", status: "used", used_at: "2027-06-01T17:00:00Z" } }));
  assert.deepEqual(ui.counts(), { "Iscritti validi": 1, "Con check-in": 1, "Senza check-in": 0 });
  assert.equal(ui.button("Registra ingresso", ui.row("Bruno Neri")), undefined);
  await ui.search("Bruno");
  await ui.selectEvent(eventB);
  assert.ok(ui.button("Prossimo biglietto"));
  assert.equal(ui.button("Attiva fotocamera"), undefined);
  assert.equal(ui.mediaRequests.length, 1);
  assert.equal(ui.authorizationCalls.length, 1);
  assert.equal(ui.navigationCalls.length, 0);
});

test("changing the event stops a running scanner and the new event always starts with the camera off", async (context) => {
  const ui = await setup(context, { initialEventId: eventB });
  await act(async () => ui.button("Attiva fotocamera").click());
  assert.equal(ui.mediaRequests.length, 1);
  assert.equal(ui.mediaRequests[0].track.readyState, "live");
  await ui.selectEvent(eventA);
  assert.equal(ui.mediaRequests[0].track.readyState, "ended");
  assert.equal(ui.mediaRequests.length, 1);
  assert.equal(window.document.getElementById("check-in-event").value, eventA);
  assert.match(window.document.body.textContent, /Fotocamera spenta/);
  await act(async () => ui.decoders[0].callback({ getText: () => "late_frame" }, undefined, ui.decoders[0].controls));
  assert.equal(ui.qrCalls.length, 0);
});

function pageHarness({ authorized = true, rows = {}, errors = {} } = {}) {
  const queries = [];
  const data = { events: events.map((event) => ({ ...event, commerce_config: { activities: event.activities } })), tickets: [], commerce_passes: [], commerce_attendee_contacts: [], ...rows };
  const admin = { from(table) {
    let fields = "";
    let from = 0;
    let to = Infinity;
    const filters = [];
    const ordering = [];
    const execute = (single = false) => {
      queries.push({ table, fields, from, to, filters: structuredClone(filters) });
      if (errors[table]) return { data: null, error: { message: "Unavailable" } };
      let result = (data[table] || []).filter((row) => filters.every(([column, value, operator]) => operator === "in" ? value.includes(row[column]) : row[column] === value));
      result = [...result].sort((a, b) => {
        for (const [column, ascending] of ordering) {
          const comparison = String(a[column] || "").localeCompare(String(b[column] || ""));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      }).slice(from, to + 1);
      if (table === "events" && fields === "commerce_config") result = result.map((row) => ({ commerce_config: row.commerce_config }));
      if (table === "commerce_attendee_contacts") result = result.map(({ pass_id, email, created_at }) => ({ pass_id, email, created_at }));
      return { data: single ? result[0] || null : result, error: null };
    };
    return {
      select(value) { fields = value; return this; },
      eq(column, value) { filters.push([column, value, "eq"]); return this; },
      in(column, value) { filters.push([column, [...value], "in"]); return this; },
      order(column, { ascending = true } = {}) { ordering.push([column, ascending]); return this; },
      range(start, end) { from = start; to = end; return this; },
      async single() { return execute(true); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
  } };
  const { default: Page } = compile("../src/app/[locale]/admin/biglietti/page.tsx", {
    "next-intl/server": { getLocale: async () => "it" },
    "@/lib/commerce/admin-auth": { async requireCommerceStaff() { if (!authorized) throw new Error("Forbidden"); return admin; } },
    "@/lib/commerce/config": { parseCommerceConfig: (config) => config },
    "@/lib/i18n-utils": { getLocalizedText: (text) => text },
    "./tickets-client": { TicketsClient: () => null },
  });
  const clientProps = (tree) => tree.props.initialTickets ? tree.props : React.Children.toArray(tree.props.children).find((child) => child.props?.initialTickets)?.props;
  return { Page, queries, clientProps };
}

for (const [label, event, expected] of [["valid", eventA, eventA], ["unknown", "unknown", ""], ["repeated", [eventA, eventB], ""], ["missing", undefined, ""]]) {
  test(`the server page awaits Next 16 searchParams and validates the ${label} event`, async () => {
    const { Page, queries, clientProps } = pageHarness();
    const tree = await Page({ searchParams: Promise.resolve({ event }) });
    const props = clientProps(tree);
    assert.equal(props.initialEventId, expected);
    assert.equal(props.events.length, 2);
    const participantQueries = queries.filter((query) => ["tickets", "commerce_passes", "commerce_attendee_contacts"].includes(query.table));
    if (!expected) assert.equal(participantQueries.length, 0);
    else for (const query of participantQueries) assert.ok(query.filters.some(([column, value]) => column === "event_id" && value === eventA));
  });
}

test("the server page rejects non-staff before loading any participant data", async () => {
  const { Page, queries } = pageHarness({ authorized: false });
  const tree = await Page({ searchParams: Promise.resolve({ event: eventA }) });
  assert.equal(tree.props.role, "alert");
  assert.equal(queries.length, 0);
});

test("the server loads every ticket page for one event and maps individual emails in bounded batches", async () => {
  const passes = Array.from({ length: 101 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    event_id: eventA, first_name: `Participant ${index}`, last_name: "QA", package_name: "Workshop", qr_code: `opaque_${index}`, status: "paid", created_at: "2026-11-18T10:00:00Z",
    events: events[0], commerce_orders: { buyer_email: "buyer@example.test" }, commerce_entitlements: [entitlement("workshop", "Workshop")],
  }));
  const legacy = Array.from({ length: 1001 }, (_, index) => ({ ...tickets[3], id: `legacy_${index}`, event_id: eventA, created_at: "2026-11-18T10:00:00Z" }));
  const contacts = passes.slice(0, 100).map((pass, index) => ({ id: `contact_${index}`, pass_id: pass.id, email: `participant-${index}@example.test`, created_at: "2026-11-19T12:00:00Z", phone: "private", document_number: "private" }));
  contacts.push({ id: "older", pass_id: passes[0].id, email: "old@example.test", created_at: "2026-11-18T12:00:00Z" });
  const { Page, queries, clientProps } = pageHarness({ rows: { tickets: [...legacy, tickets[6]], commerce_passes: passes, commerce_attendee_contacts: contacts } });
  const tree = await Page({ searchParams: Promise.resolve({ event: eventA }) });
  const props = clientProps(tree);
  assert.equal(props.initialTickets.length, 1102);
  assert.equal(props.initialTickets.some((ticket) => ticket.event_id === eventB), false);
  assert.equal(props.initialTickets.find((ticket) => ticket.id === passes[0].id).buyer_email, "participant-0@example.test");
  assert.equal(props.initialTickets.find((ticket) => ticket.id === passes[100].id).buyer_email, "buyer@example.test");
  assert.deepEqual(queries.filter((query) => query.table === "tickets").map(({ from, to }) => [from, to]), [[0, 499], [500, 999], [1000, 1499]]);
  const contactQueries = queries.filter((query) => query.table === "commerce_attendee_contacts");
  assert.equal(contactQueries.length, 2);
  for (const query of contactQueries) {
    assert.equal(query.fields, "pass_id,email,created_at");
    const [, ids, operator] = query.filters[0];
    assert.equal(operator, "in");
    assert.ok(ids.length <= 100);
    assert.ok(ids.every((id) => passes.some((pass) => pass.id === id)));
  }
  for (const ticket of props.initialTickets) {
    assert.equal("phone" in ticket, false);
    assert.equal("document_number" in ticket, false);
  }
});

test("unavailable participant contacts show a warning and preserve the legacy buyer email fallback", async () => {
  const pass = { id: "pass", event_id: eventA, first_name: "Ada", last_name: "QA", package_name: "Workshop", qr_code: "opaque", status: "paid", events: events[0], commerce_orders: { buyer_email: "buyer@example.test" }, commerce_entitlements: [entitlement("workshop", "Workshop")] };
  const { Page, clientProps } = pageHarness({ rows: { commerce_passes: [pass] }, errors: { commerce_attendee_contacts: true } });
  const tree = await Page({ searchParams: Promise.resolve({ event: eventA }) });
  assert.equal(clientProps(tree).initialTickets[0].buyer_email, "buyer@example.test");
  const warning = React.Children.toArray(tree.props.children).find((child) => child.props?.role === "status");
  assert.match(warning.props.children, /email dell’acquirente/);
});

test("the roster explicitly joins the original order when both purchase and upgrade relationships exist", async () => {
  const pass = { id: "pass", event_id: eventA, first_name: "Ada", last_name: "QA", package_name: "Workshop", qr_code: "opaque", status: "paid", events: events[0], commerce_orders: { buyer_email: "original-buyer@example.test" }, commerce_entitlements: [entitlement("workshop", "Workshop")] };
  const { Page, queries, clientProps } = pageHarness({ rows: { commerce_passes: [pass] } });
  const tree = await Page({ searchParams: Promise.resolve({ event: eventA }) });
  const passQueries = queries.filter((query) => query.table === "commerce_passes");
  assert.ok(passQueries.length > 0);
  for (const query of passQueries) {
    assert.match(query.fields, /commerce_orders:commerce_orders!commerce_passes_order_id_fkey\(buyer_email\)/);
    assert.doesNotMatch(query.fields, /(?:^|,)commerce_orders\(buyer_email\)/);
    assert.doesNotMatch(query.fields, /commerce_upgrade_pass_fk/);
  }
  const [ticket] = clientProps(tree).initialTickets;
  assert.equal(ticket.id, pass.id);
  assert.equal(ticket.buyer_email, "original-buyer@example.test");
});

const affiliateA = "aaaaaaaa-1111-4111-8111-111111111111";
const affiliateB = "bbbbbbbb-2222-4222-8222-222222222222";
const affiliatedEvents = [{ ...events[0], affiliates: [{ id: affiliateA, name: "Scuola Aurora", active: true }, { id: affiliateB, name: "Referente Bruno", active: false }] }, events[1]];
const affiliatedTickets = tickets.map((ticket) => ["ada", "edo"].includes(ticket.id) ? { ...ticket, affiliate_id: affiliateA, affiliate_name: "Scuola Aurora originale" } : ticket.id === "luca" ? { ...ticket, affiliate_id: affiliateB, affiliate_name: "Referente Bruno" } : ticket);

test("the affiliate filter shows one participant per ticket, direct sales and retired affiliates with valid participant counts", async (context) => {
  const ui = await setup(context, { initialEventId: eventA, eventRows: affiliatedEvents, ticketRows: affiliatedTickets });
  const filter = () => window.document.getElementById("tickets-affiliate");
  assert.match(filter().querySelector(`option[value="${affiliateA}"]`).textContent, /Scuola Aurora · 2 iscritti validi/);
  assert.match(filter().querySelector(`option[value="${affiliateB}"]`).textContent, /disattivato · 1 iscritti validi/);
  assert.match(filter().querySelector('option[value="direct"]').textContent, /1 iscritti validi/);
  await ui.select(filter(), affiliateA);
  assert.equal(ui.rows().length, 2);
  assert.ok(ui.row("Ada Rossi"));
  assert.ok(ui.row("Edo Bianchi"));
  assert.match(ui.row("Ada Rossi").textContent, /Scuola Aurora originale/);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 2, "Con check-in": 0, "Senza check-in": 2 });
  assert.equal(new URL(window.location.href).searchParams.get("affiliate"), affiliateA);
  await ui.search("Ada");
  assert.equal(ui.rows().length, 1);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 2, "Con check-in": 0, "Senza check-in": 2 });
  await ui.select(filter(), "direct");
  assert.equal(ui.rows().length, 3);
  assert.ok(ui.row("Nina Blu"));
  assert.equal(ui.row("Ada Rossi"), undefined);
  assert.deepEqual(ui.counts(), { "Iscritti validi": 1, "Con check-in": 0, "Senza check-in": 1 });
  assert.match(ui.row("Nina Blu").textContent, /Acquisto diretto/);
  await ui.selectEvent(eventB);
  assert.equal(new URL(window.location.href).searchParams.has("affiliate"), false);
  assert.equal(filter(), null);
  assert.ok(ui.row("Bruno Neri"));
  assert.equal(ui.mediaRequests.length, 0);
});

test("deep links open a retired affiliate list and unknown affiliate IDs cannot hide or expose another event", async (context) => {
  const ui = await setup(context, { initialEventId: eventA, eventRows: affiliatedEvents, ticketRows: affiliatedTickets, url: `/it/admin/biglietti?event=${eventA}&affiliate=${affiliateB}` });
  assert.equal(window.document.getElementById("tickets-affiliate").value, affiliateB);
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.row("Luca Verdi"));
  assert.deepEqual(ui.counts(), { "Iscritti validi": 1, "Con check-in": 1, "Senza check-in": 0 });
  assert.equal(ui.mediaRequests.length, 0);
});

test("manual check-in within an affiliate list retains attribution and updates only that affiliate's counters", async (context) => {
  const ui = await setup(context, { initialEventId: eventA, eventRows: affiliatedEvents, ticketRows: affiliatedTickets, url: `/it/admin/biglietti?event=${eventA}&affiliate=${affiliateA}` });
  await ui.select(ui.row("Ada Rossi").querySelector("select"), "workshop");
  await act(async () => ui.button("Registra attività", ui.row("Ada Rossi")).click());
  assert.equal(ui.actionCalls[0].eventId, eventA);
  await ui.respond({ outcome: "admitted", message: "Workshop confermato.", ticket: { id: "ada", event_id: eventA, buyer_nome: "Ada", buyer_cognome: "Rossi", status: "paid", used_at: null, commerce: true, entitlements: [entitlement("workshop", "Workshop", { status: "used", checked_in_at: "2026-11-19T00:30:00Z" }), entitlement("dinner", "Cena")] } });
  assert.deepEqual(ui.counts(), { "Iscritti validi": 2, "Con check-in": 1, "Senza check-in": 1 });
  assert.match(ui.row("Ada Rossi").textContent, /Scuola Aurora originale/);
  assert.equal(window.document.getElementById("tickets-affiliate").value, affiliateA);
  assert.equal(ui.mediaRequests.length, 0);
});

test("the server roster carries original affiliate snapshots and filters through validated event scoped deep links", async () => {
  const pass = { id: "pass", event_id: eventA, first_name: "Ada", last_name: "QA", package_name: "Workshop", qr_code: "opaque", status: "paid", affiliate_id: affiliateA, affiliate_name: "Scuola al momento dell’acquisto", events: events[0], commerce_orders: { buyer_email: "buyer@example.test" }, commerce_entitlements: [entitlement("workshop", "Workshop")] };
  const legacy = { ...tickets[3], affiliate_id: affiliateB, affiliate_name: "Referente precedente" };
  const { Page, queries, clientProps } = pageHarness({ rows: { events: affiliatedEvents, tickets: [legacy], commerce_passes: [pass] } });
  const tree = await Page({ searchParams: Promise.resolve({ event: eventA, affiliate: affiliateA }) });
  const props = clientProps(tree);
  assert.equal(props.initialAffiliateId, affiliateA);
  assert.equal(props.initialTickets.find((ticket) => ticket.id === pass.id).affiliate_name, pass.affiliate_name);
  assert.equal(props.initialTickets.find((ticket) => ticket.id === legacy.id).affiliate_id, affiliateB);
  assert.equal(props.events.find((event) => event.id === eventA).affiliates[0].id, affiliateA);
  for (const query of queries.filter((entry) => ["tickets", "commerce_passes"].includes(entry.table))) assert.match(query.fields, /affiliate_id,affiliate_name/);
});

test("unknown affiliate links default to the event list and snapshot-only affiliates remain selectable", async (context) => {
  const archivedId = "cccccccc-3333-4333-8333-333333333333";
  const snapshotTickets = affiliatedTickets.map((ticket) => ticket.id === "edo" ? { ...ticket, affiliate_id: archivedId, affiliate_name: "Scuola precedente" } : ticket);
  const ui = await setup(context, { initialEventId: eventA, eventRows: affiliatedEvents, ticketRows: snapshotTickets, url: `/it/admin/biglietti?event=${eventA}&affiliate=unknown` });
  const filter = window.document.getElementById("tickets-affiliate");
  assert.equal(filter.value, "");
  assert.equal(ui.rows().length, 6);
  assert.equal(ui.row("Bruno Neri"), undefined);
  assert.match(filter.querySelector(`option[value="${archivedId}"]`).textContent, /Scuola precedente · disattivato · 1 iscritti validi/);
  await ui.select(filter, archivedId);
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.row("Edo Bianchi"));
  assert.deepEqual(ui.counts(), { "Iscritti validi": 1, "Con check-in": 0, "Senza check-in": 1 });
});
