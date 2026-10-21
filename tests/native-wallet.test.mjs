import { dateFormatModule } from "./helpers/date-format-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/es/biglietti", pretendToBeVisual: true });
const { window } = dom;
const original = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => { window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function compile(path, mocks = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, window, document: window.document, Event: window.Event, AbortController, URL, fetch: mocks.fetch, require: (name) => mocks[name] || (name === "@/lib/events/date-format" ? dateFormatModule : require(name)) });
  return exports;
}
const wallet = compile("lib/tickets/wallet.ts");
const copy = compile("components/meraki/wallet-copy.ts");
const ticket = { id: "00000000-0000-4000-8000-000000000001", token: "private-test-token", title: "Meraki test", date: "2099-08-01T08:00:00Z", location: "Bolzano", status: "paid" };
const Anchor = ({ children, ...props }) => { const linkProps = { ...props }; delete linkProps.prefetch; return React.createElement("a", linkProps, children); };
async function mount(context, Component, props) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(window.document.querySelector("#root"));
  context.after(() => act(async () => root.unmount()));
  await act(async () => { root.render(React.createElement(Component, props)); });
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 20)));
}

for (const [locale, noAccount, openEmail, deviceOnly, emptyTitle] of [
  ["it", "Non serve creare un account.", "Apri il biglietto nell’email", "Biglietti salvati solo in questo browser", "Nessun biglietto salvato qui"],
  ["en", "No account is needed.", "Open the ticket in your email", "Tickets saved only in this browser", "No tickets saved here yet"],
  ["de", "Du brauchst kein Konto.", "Öffne das Ticket in deiner E-Mail", "Tickets nur in diesem Browser gespeichert", "Hier sind noch keine Tickets gespeichert"],
  ["es", "No necesitas crear una cuenta.", "Abre la entrada desde tu email", "Entradas guardadas solo en este navegador", "Todavía no hay entradas guardadas aquí"],
]) {
  test(`empty ${locale} wallet explains email access without an account and exposes the import form`, async (context) => {
    window.localStorage.clear();
    let requests = 0;
    const { TicketWallet } = compile("components/meraki/ticket-wallet.tsx", {
      "@/lib/tickets/wallet": wallet, "./wallet-copy": copy,
      "next/link": { default: Anchor, __esModule: true },
      fetch: async () => { requests++; throw new Error("An empty wallet must not fetch tickets by identity"); },
    });
    await mount(context, TicketWallet, { locale, siteOrigin: "https://meraki.test" });
    assert.ok(window.document.body.textContent.includes(noAccount));
    const guide = window.document.querySelector('section[aria-labelledby="meraki-wallet-guide"]');
    assert.equal(guide.querySelectorAll("ol > li").length, 2);
    assert.ok(guide.textContent.includes(openEmail));
    assert.ok(window.document.body.textContent.includes(deviceOnly));
    const emptyHeading = [...window.document.querySelectorAll("h2")].find((heading) => heading.textContent === emptyTitle);
    assert.ok(emptyHeading);
    const linkInput = window.document.querySelector("#meraki-ticket-link");
    assert.ok(linkInput);
    assert.equal(window.document.querySelectorAll("form").length, 1);
    assert.ok(linkInput.compareDocumentPosition(emptyHeading) & window.Node.DOCUMENT_POSITION_FOLLOWING, "email-link import precedes the empty-state illustration and discovery link");
    assert.equal(linkInput.closest("details"), null, "the emailed-link import stays visible without opening another control");
    assert.equal(linkInput.required, true);
    assert.equal(window.document.querySelector('input[type="email"], input[type="password"]'), null);
    assert.equal(requests, 0);
  });
}

test("Spanish wallet validates imports in Spanish and submits the Spanish locale", async (context) => {
  window.localStorage.clear();
  const requests = [];
  const { TicketWallet } = compile("components/meraki/ticket-wallet.tsx", {
    "@/lib/tickets/wallet": wallet, "./wallet-copy": copy,
    "next/link": { default: Anchor, __esModule: true },
    fetch: async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ tickets: [ticket] }) }; },
  });
  await mount(context, TicketWallet, { locale: "es", siteOrigin: "https://meraki.test" });
  assert.equal(window.document.querySelector("h1").textContent, "Mis entradas");
  const input = window.document.querySelector("input");
  const change = async (value) => act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  const submit = () => act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await change(`https://foreign.example/es/biglietto/${ticket.id}?token=${ticket.token}`);
  await submit();
  assert.equal(requests.length, 0);
  assert.match(window.document.querySelector('[role="status"]').textContent, /Pega el enlace personal/);
  await change(`/es/biglietto/${ticket.id}?token=${ticket.token}`);
  await submit();
  assert.equal(requests[0].locale, "es");
  assert.deepEqual(requests[0], { locale: "es", tickets: [{ id: ticket.id, token: ticket.token }] });
  assert.ok(window.document.querySelector(`a[href="/es/biglietto/${ticket.id}?token=${ticket.token}"]`));
  assert.match(window.document.body.textContent, /Mostrar entrada/);
  assert.equal(window.document.querySelector("#meraki-wallet-guide"), null, "saved tickets take priority over the first-use guide");
  assert.equal(window.document.querySelectorAll("form").length, 1);
  assert.ok(window.document.querySelector("article").compareDocumentPosition(window.document.querySelector("form")) & window.Node.DOCUMENT_POSITION_FOLLOWING, "saved tickets precede the additional import form");
  assert.deepEqual(Object.keys(JSON.parse(window.localStorage.getItem(wallet.WALLET_KEY))[0]).sort(), ["date", "id", "location", "status", "title", "token"]);
});

test("ticket registration keeps storage minimal and displays the selected language", async (context) => {
  window.localStorage.clear();
  const { RegisterTicket } = compile("components/meraki/register-ticket.tsx", { "@/lib/tickets/wallet": wallet, "./wallet-copy": copy });
  await mount(context, RegisterTicket, { locale: "de", ticket: { ...ticket, email: "must-not-be-saved@example.test", documentNumber: "must-not-be-saved" } });
  assert.match(window.document.querySelector('[role="status"]').textContent, /Meine Tickets/);
  const saved = window.localStorage.getItem(wallet.WALLET_KEY);
  assert.equal(saved.includes("must-not-be-saved"), false);
});

test("canceled event tickets appear in the past collection with a cancellation label, independently of refund status", async (context) => {
  window.localStorage.clear();
  const canceled = { ...ticket, status: "canceled" };
  window.localStorage.setItem(wallet.WALLET_KEY, JSON.stringify([canceled]));
  const { TicketWallet } = compile("components/meraki/ticket-wallet.tsx", {
    "@/lib/tickets/wallet": wallet, "./wallet-copy": copy,
    "next/link": { default: Anchor, __esModule: true },
    fetch: async () => ({ ok: true, json: async () => ({ tickets: [canceled] }) }),
  });
  await mount(context, TicketWallet, { locale: "it", siteOrigin: "https://meraki.test" });
  assert.equal(window.document.querySelectorAll("article").length, 0);
  const past = [...window.document.querySelectorAll("button")].find(button => button.textContent.startsWith("Passati"));
  await act(async () => past.click());
  assert.equal(window.document.querySelectorAll("article").length, 1);
  assert.ok(window.document.querySelector("article").textContent.includes("Evento annullato"));
  assert.equal(window.document.querySelector("article").textContent.includes("Rimborsato"), false);
  assert.equal(window.document.querySelector("article").textContent.includes("Mostra il biglietto"), false);
});


test("wallet cards translate calendar words and show optional check-in opening separately in Italian time", async (context) => {
  const configured = { ...ticket, date: "2099-11-19T00:30:00+01:00", checkInStartsAt: "2099-11-18T23:00:00+01:00" };
  const expectedLabels = { it: "Apertura check-in", en: "Check-in opens", de: "Check-in öffnet", es: "Apertura del check-in" };
  for (const locale of ["it", "en", "de", "es"]) {
    window.localStorage.setItem(wallet.WALLET_KEY, JSON.stringify([configured]));
    const { TicketWallet } = compile("components/meraki/ticket-wallet.tsx", {
      "@/lib/tickets/wallet": wallet, "./wallet-copy": copy,
      "next/link": { default: Anchor, __esModule: true },
      fetch: async () => ({ ok: true, json: async () => ({ tickets: [configured] }) }),
    });
    await mount(context, TicketWallet, { locale, siteOrigin: "https://meraki.test" });
    const text = window.document.querySelector("article").textContent;
    assert.ok(text.includes(expectedLabels[locale]));
    assert.ok(text.includes("18/11/2099, 23:00"));
    assert.ok(text.includes("00:30"));
    assert.ok(text.includes({ it: "nov", en: "Nov", de: "Nov", es: "nov" }[locale]), "month follows the interface language");
    assert.ok(text.includes({ it: "gio", en: "Thu", de: "Do.", es: "jue" }[locale]), "weekday follows the interface language");
    assert.equal(/\b[AP]M\b/.test(text), false);
    const saved = JSON.parse(window.localStorage.getItem(wallet.WALLET_KEY))[0];
    assert.equal(saved.checkInStartsAt, configured.checkInStartsAt);
  }
});

test("verified registration persists an opening time while keeping unknown personal data out", async (context) => {
  window.localStorage.clear();
  const { RegisterTicket } = compile("components/meraki/register-ticket.tsx", { "@/lib/tickets/wallet": wallet, "./wallet-copy": copy });
  await mount(context, RegisterTicket, { locale: "en", ticket: { ...ticket, checkInStartsAt: "2099-08-01T09:30:00+02:00", email: "private@example.test" } });
  const saved = JSON.parse(window.localStorage.getItem(wallet.WALLET_KEY))[0];
  assert.equal(saved.checkInStartsAt, "2099-08-01T09:30:00+02:00");
  assert.equal(saved.email, undefined);
});
