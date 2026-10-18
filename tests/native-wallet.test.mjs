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
  vm.runInNewContext(compiled, { exports, window, document: window.document, Event: window.Event, AbortController, URL, fetch: mocks.fetch, require: (name) => mocks[name] || require(name) });
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
  assert.ok(window.document.querySelector(`a[href="/es/biglietto/${ticket.id}?token=${ticket.token}"]`));
  assert.match(window.document.body.textContent, /Mostrar entrada/);
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
