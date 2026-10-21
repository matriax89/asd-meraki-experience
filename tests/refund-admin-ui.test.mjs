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
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/rimborsi", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function load(file, mocks = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, URL, Error, window, console, ...globals, require: name => name in mocks ? mocks[name] : name in nativeFormControlMocks ? nativeFormControlMocks[name] : require(name) });
  return compiledModule.exports;
}
const model = load("app/[locale]/admin/rimborsi/refund-view.ts");
const eventId = "e45a048b-338b-47ae-9de4-920dcad06ccb";
const paymentId = "849d46bc-05ce-4e28-9139-512995c0e151";
const rightWs = "2996261b-8737-45be-9042-1eb88c59e031";
const rightMc = "c2e902d6-bfcc-4116-8725-3f6f8da62377";
const fixture = (changes = {}) => ({ events: [{ id: eventId, title: "Meraki Inverno" }], event: { id: eventId, title: "Meraki Inverno", canceledAt: null, cancellationReason: null }, canManage: true, cancellation: null, payments: [{ id: paymentId, kind: "commerce", buyerEmail: "ada@example.test", amountCents: 8500, refundedCents: 1000, pendingCents: 0, availableCents: 7500, createdAt: "2026-10-21T11:00:00Z", participants: [{ name: "Ada Rossi", entitlements: [{ id: rightWs, name: "Workshop", status: "valid" }, { id: rightMc, name: "Masterclass", status: "valid" }] }], refunds: [] }], ...changes });
const response = result => ({ ok: true, json: async () => result });
const button = text => [...window.document.querySelectorAll("button")].find(node => node.textContent === text || (text instanceof RegExp && text.test(node.textContent)));
const click = async node => { assert.ok(node, "expected control exists"); await act(async () => node.click()); };
const fill = async (id, value) => {
  const node = window.document.getElementById(id);
  assert.ok(node, `field ${id} exists`);
  await act(async () => {
    const prototype = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
const select = async (id, value) => { const node = window.document.getElementById(id); await act(async () => { node.value = value; node.dispatchEvent(new window.Event("change", { bubbles: true })); }); };
async function setup(context, initial = fixture(), onFetch = () => response(initial)) {
  window.history.replaceState(null, "", `/it/admin/rimborsi?event=${eventId}&source=events`);
  window.document.body.innerHTML = '<div id="root"></div>';
  const requests = [];
  let counter = 0;
  const { RefundsClient } = load("app/[locale]/admin/rimborsi/refunds-client.tsx", {
    "./refund-view": model,
    "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  }, { crypto: { randomUUID: () => `b368333e-b7ea-4f50-9e38-${String(++counter).padStart(12, "0")}` }, fetch: async (url, options) => { const request = { url, body: options?.body ? JSON.parse(options.body) : null }; requests.push(request); return onFetch(request, requests); } });
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(RefundsClient, { initialEventId: eventId, initialPanel: initial })));
  context.after(async () => { await act(async () => root.unmount()); });
  return requests;
}

test("refund amount parsing uses exact integer cents and Italian Rome formatting", () => {
  assert.equal(model.parseRefundAmount("25,50"), 2550);
  assert.equal(model.parseRefundAmount("25.5"), 2550);
  assert.equal(model.parseRefundAmount("0,01"), 1);
  for (const invalid of ["0", "-1", "1e3", "1.000,00", "15,005", "NaN", ""]) assert.equal(model.parseRefundAmount(invalid), null);
  assert.equal(model.refundAmountText(7505), "75,05");
  assert.ok(model.refundDate("2026-12-19T23:30:00Z").includes("20/12/2026"));
});

test("a full refund requires a review and refunds the balance, with all payment-owned rights", async context => {
  const requests = await setup(context, fixture(), request => request.body ? response({ refund: { status: "pending" } }) : response(fixture()));
  assert.equal(requests.length, 0, "SSR snapshot causes no duplicate initial fetch");
  await click(button("Prepara rimborso"));
  assert.equal(button("Rivedi il rimborso →").disabled, true);
  await fill(`refund-reason-${paymentId}`, "Rinuncia del partecipante");
  await click(button("Rivedi il rimborso →"));
  assert.equal(requests.length, 0, "review does not issue a refund");
  assert.ok(window.document.body.textContent.includes("metodo di pagamento originale"));
  await click(button(/^Conferma rimborso di/));
  const post = requests.find(request => request.body);
  assert.equal(post.url, "/api/admin/refunds");
  assert.equal(post.body.orderId, paymentId);
  assert.equal(post.body.amountCents, 7500);
  assert.equal(post.body.expectedAvailableCents, 7500, "freeze the reviewed balance for the server-side concurrency check");
  assert.deepEqual(post.body.entitlementIds, [rightWs, rightMc]);
  assert.equal(post.body.confirm, true);
  assert.equal(post.body.confirmUsed, false);
  assert.equal(window.document.body.textContent.includes("Rimborso confermato"), false, "pending is not presented as succeeded");
});

test("partial refunds keep admissions by default and revoke only the operator's explicit selection", async context => {
  const requests = await setup(context, fixture(), request => request.body ? response({ refund: { status: "pending" } }) : response(fixture()));
  await click(button("Prepara rimborso"));
  await select(`refund-mode-${paymentId}`, "partial");
  await fill(`refund-amount-${paymentId}`, "25,50");
  await fill(`refund-reason-${paymentId}`, "Rimborso della masterclass");
  const choices = [...window.document.querySelectorAll('input[type="checkbox"]')];
  assert.equal(choices.every(node => !node.checked), true);
  await click(choices[1]);
  await click(button("Rivedi il rimborso →"));
  assert.ok(window.document.querySelector('section[aria-label^="Nuovo rimborso"]').textContent.includes("Ada Rossi · Masterclass"));
  await click(button(/^Conferma rimborso di/));
  const post = requests.find(request => request.body);
  assert.equal(post.body.amountCents, 2550);
  assert.equal(post.body.expectedAvailableCents, 7500);
  assert.deepEqual(post.body.entitlementIds, [rightMc]);
});

test("used rights require a separate acknowledgment and cannot silently pass the review", async context => {
  const initial = fixture(); initial.payments[0].participants[0].entitlements[0].status = "used";
  await setup(context, initial);
  await click(button("Prepara rimborso"));
  await fill(`refund-reason-${paymentId}`, "Rinuncia dopo il check-in");
  assert.equal(button("Rivedi il rimborso →").disabled, true);
  await click(window.document.querySelector('input[type="checkbox"]'));
  assert.equal(button("Rivedi il rimborso →").disabled, false);
});

test("uncertain responses retain the same idempotency identifier and freeze the reviewed request", async context => {
  let attempts = 0;
  const requests = await setup(context, fixture(), request => { if (request.body && ++attempts === 1) throw new Error("Connessione interrotta"); return request.body ? response({ refund: { status: "pending" } }) : response(fixture()); });
  await click(button("Prepara rimborso"));
  await fill(`refund-reason-${paymentId}`, "Rinuncia confermata");
  await click(button("Rivedi il rimborso →"));
  await click(button(/^Conferma rimborso di/));
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("Connessione interrotta"));
  assert.equal(button("Modifica").disabled, true);
  await click(button(/^Conferma rimborso di/));
  const posts = requests.filter(request => request.body);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.requestId, posts[1].body.requestId);
  assert.deepEqual(posts[0].body, posts[1].body);
});

test("staff with read access sees history without financial or cancellation controls", async context => {
  const initial = fixture({ canManage: false });
  initial.payments[0].refunds = [{ id: "refund", amountCents: 1000, status: "succeeded", reason: "Rinuncia", createdAt: "2026-10-21T12:00:00Z", error: null, emailSentAt: "2026-10-21T12:01:00Z" }];
  const requests = await setup(context, initial);
  assert.equal(button("Prepara rimborso"), undefined);
  assert.equal(button("Prepara annullamento"), undefined);
  assert.ok(window.document.body.textContent.includes("Solo gli amministratori"));
  assert.ok(window.document.body.textContent.includes("Email inviata"));
  assert.equal(requests.length, 0);
});

test("cancellation needs the exact event title and prepares a queue before an explicit processing action", async context => {
  const initial = fixture();
  const canceled = fixture({ event: { ...initial.event, canceledAt: "2026-10-21T12:00:00Z", cancellationReason: "Problema alla sede" }, cancellation: { id: "cancel", status: "processing", totalPayments: 1, completed: 0, pending: 0, remaining: 1, failed: 0, emailsRemaining: 1 } });
  let state = initial;
  const requests = await setup(context, initial, request => {
    if (request.url.endsWith("/cancel-event")) { state = canceled; return response({ cancellation: canceled.cancellation }); }
    if (request.url.endsWith("/process")) return response({ ...canceled, errors: ["Verifica richiesta al provider"] });
    return response(state);
  });
  await click(button("Prepara annullamento"));
  await fill("cancel-event-reason", "Problema alla sede");
  await fill("cancel-event-confirmation", "Meraki inverno");
  assert.equal(button("Conferma annullamento dell’evento").disabled, true);
  await fill("cancel-event-confirmation", "Meraki Inverno");
  await click(button("Conferma annullamento dell’evento"));
  assert.equal(requests.filter(request => request.url.endsWith("/process")).length, 0, "cancel confirmation does not silently execute batches");
  assert.ok(window.document.body.textContent.includes("Evento annullato"));
  await click(button("Elabora rimborsi e invia comunicazioni"));
  assert.equal(requests.filter(request => request.url.endsWith("/process")).length, 1);
  assert.ok(window.document.body.textContent.includes("Verifica richiesta al provider"));
});

test("legacy partial refund keeps the ticket and never submits synthetic admission identifiers", async context => {
  const initial = fixture(); initial.payments[0].kind = "legacy"; initial.payments[0].participants[0].entitlements = [{ id: "legacy-ticket", name: "Ingresso evento", status: "used" }];
  const requests = await setup(context, initial, request => request.body ? response({ refund: { status: "pending" } }) : response(initial));
  await click(button("Prepara rimborso")); await select(`refund-mode-${paymentId}`, "partial");
  await fill(`refund-amount-${paymentId}`, "15,00"); await fill(`refund-reason-${paymentId}`, "Rettifica quota");
  assert.equal(button("Rivedi il rimborso →").disabled, true);
  await click(window.document.querySelector('input[type="checkbox"]'));
  await click(button("Rivedi il rimborso →"));
  assert.ok(window.document.body.textContent.includes("Il biglietto rimane valido"));
  await click(button(/^Conferma rimborso di/));
  const post = requests.find(request => request.body);
  assert.equal(post.body.ticketReservationId, paymentId);
  assert.deepEqual(post.body.entitlementIds, []);
  assert.equal(post.body.confirmUsed, true);
});

test("a full balance typed as a partial amount still reviews the full admission revocation", async context => {
  const requests = await setup(context);
  await click(button("Prepara rimborso")); await select(`refund-mode-${paymentId}`, "partial");
  await fill(`refund-amount-${paymentId}`, "75,00"); await fill(`refund-reason-${paymentId}`, "Rimborso di tutto il residuo");
  assert.equal(window.document.querySelectorAll('input[type="checkbox"]').length, 0);
  await click(button("Rivedi il rimborso →"));
  const review = window.document.querySelector('section[aria-label^="Nuovo rimborso"]');
  assert.ok(review.textContent.includes("Ada Rossi · Workshop")); assert.ok(review.textContent.includes("Ada Rossi · Masterclass"));
  assert.equal(requests.length, 0);
});

test("a background refresh cannot silently change an amount that the operator is reviewing", async context => {
  const initial = fixture(); const updated = fixture();
  updated.payments[0].refundedCents = 2000; updated.payments[0].availableCents = 6500;
  const requests = await setup(context, initial, request => {
    if (request.url === "/api/admin/refunds") return { ok: false, json: async () => ({ error: "Il residuo è cambiato. Ricarica i dati." }) };
    return response(updated);
  });
  await click(button("Prepara rimborso")); await fill(`refund-reason-${paymentId}`, "Rinuncia confermata");
  await click(button("Rivedi il rimborso →"));
  await click(button("Verifica rimborsi e invia le email in sospeso"));
  assert.ok(button(/^Conferma rimborso di/).textContent.includes("75,00"), "the reviewed amount stays frozen");
  await click(button(/^Conferma rimborso di/));
  const post = requests.find(request => request.url === "/api/admin/refunds" && request.body);
  assert.equal(post.body.amountCents, 7500); assert.equal(post.body.expectedAvailableCents, 7500);
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("Il residuo è cambiato"));
});

test("event selection loads an explicit scope and retains unrelated navigation parameters", async context => {
  const nextId = "ff0495fa-4dde-4875-8334-499570b06b7e";
  const initial = fixture(); initial.events.push({ id: nextId, title: "Meraki Estate" });
  const next = fixture({ ...initial, event: { ...initial.event, id: nextId, title: "Meraki Estate" }, payments: [] });
  const requests = await setup(context, initial, () => response(next));
  await select("refund-event", nextId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `/api/admin/refunds?eventId=${nextId}`);
  assert.equal(new URL(window.location.href).searchParams.get("event"), nextId);
  assert.equal(new URL(window.location.href).searchParams.get("source"), "events");
  assert.ok(window.document.body.textContent.includes("Meraki Estate"));
});

test("SSR route uses authenticated data and suppresses sensitive exception details", async () => {
  const calls = [];
  const page = load("app/[locale]/admin/rimborsi/page.tsx", {
    "./refunds-client": { RefundsClient: props => React.createElement("p", null, props.initialPanel.event.title) },
    "@/lib/refunds/auth": { requireRefundAccess: async () => ({ db: "authorized-db", canManage: true }) },
    "@/lib/refunds/data": { loadRefundPanel: async (...args) => { calls.push(args); return fixture(); } },
  }).default;
  assert.ok(renderToStaticMarkup(await page({ searchParams: Promise.resolve({ event: eventId }) })).includes("Meraki Inverno"));
  assert.deepEqual(calls, [["authorized-db", eventId, true]]);
  const failed = load("app/[locale]/admin/rimborsi/page.tsx", { "./refunds-client": {}, "@/lib/refunds/auth": { requireRefundAccess: async () => { throw new Error("secret-customer@example.test"); } }, "@/lib/refunds/data": {} }).default;
  const html = renderToStaticMarkup(await failed({ searchParams: Promise.resolve({}) }));
  assert.ok(html.includes('role="alert"')); assert.equal(html.includes("secret-customer"), false);
});
