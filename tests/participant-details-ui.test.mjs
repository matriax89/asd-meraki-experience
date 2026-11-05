import assert from "node:assert/strict";
import test, { after } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { participantDetailsModule } from "./helpers/participant-details.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/biglietti", pretendToBeVisual: true });
const { window } = dom;
const previous = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const priorFocus = new WeakMap();
// JSDOM allows React's autoFocus inside a closed dialog. Native browsers do not,
// so remember the last focused element outside dialogs for focus restoration.
let outsideFocus = null;
window.document.addEventListener("focusin", event => { if (event.target instanceof window.HTMLElement && !event.target.closest("dialog")) outsideFocus = event.target; });
window.HTMLDialogElement.prototype.showModal = function () { const current = window.document.activeElement; priorFocus.set(this, this.contains(current) ? outsideFocus : current); this.open = true; this.querySelector("[autofocus],button")?.focus(); };
window.HTMLDialogElement.prototype.close = function () { this.open = false; priorFocus.get(this)?.focus(); };
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });

const eventId = "43491c74-13c3-4747-8eaa-fbf9432c323e";
const participantId = "5c9d7464-cf07-4f55-beb7-73263ff474f8";
const person = { id: participantId, source: "commerce", firstName: "Ada", lastName: "Rossi", email: "ada@example.test", phone: "+393331234567", buyerEmail: "buyer@example.test", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "RSSMRA80A01H501U", maskedDocument: "••••••••••••501U", packageName: "Workshop + Masterclass", status: "paid", valid: true, checkedIn: true, checkedInAt: "2026-12-19T11:30:00Z", createdAt: "2026-11-05T10:00:00Z", affiliateId: null, affiliateName: "Acquisti diretti", privacyVersion: "2026-10-18-v1", contactCreatedAt: "2026-11-05T10:00:00Z", contactAvailable: true, marketingConsent: false, activities: [{ id: "ws", name: "Workshop", kind: "workshop", status: "used", checkedInAt: "2026-12-19T11:30:00Z", menuChoice: null }, { id: "dinner", name: "Cena", kind: "dinner", status: "valid", checkedInAt: null, menuChoice: "Vegetariano" }] };
const details = (changes = {}) => ({ event: { id: eventId, title: "Vibra", startsAt: "2026-12-19T11:30:00Z", canceled: false }, participant: { ...person, ...changes } });
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (body, ok = true) => ({ ok, json: async () => body });
async function mount(context, fetcher) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const calls = [];
  const { ParticipantDetailsButton } = participantDetailsModule(window, (...args) => { calls.push(args); return fetcher(...args); });
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(ParticipantDetailsButton, { eventId, participantId, source: "commerce", name: "Ada Rossi" })));
  context.after(async () => { await act(async () => root.unmount()); });
  const trigger = window.document.querySelector('button[aria-haspopup="dialog"]');
  const click = async element => { await act(async () => { element.focus(); element.click(); }); };
  return { calls, trigger, click };
}

test("the eye reads only the selected participant on demand and presents all saved registration data", async context => {
  const request = pending(); const ui = await mount(context, () => request.promise);
  assert.equal(ui.calls.length, 0); assert.equal(window.document.querySelector("dialog") === null, true);
  ui.trigger.focus(); await ui.click(ui.trigger);
  const dialog = window.document.querySelector("dialog");
  assert.equal(dialog.open, true); assert.match(dialog.getAttribute("aria-labelledby"), /./);
  assert.equal(dialog.querySelector('[role="status"]').textContent, "Caricamento dati…");
  const [url, options] = ui.calls[0]; const params = new URL(url, window.location.origin).searchParams;
  assert.equal(params.get("event"), eventId); assert.equal(params.get("participant"), participantId); assert.equal(params.get("source"), "commerce");
  assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin");
  await act(async () => request.resolve(response(details())));
  for (const value of [person.email, person.phone, person.buyerEmail, person.documentNumber, person.packageName, person.privacyVersion, "Vegetariano", "Check-in registrato"]) assert.ok(dialog.textContent.includes(value), value);
  assert.equal([...dialog.querySelectorAll("dt")].find(node => node.textContent === "Preferenza marketing all’iscrizione").nextElementSibling.textContent, "No");
  await ui.click(dialog.querySelector('[aria-label="Chiudi dati partecipante"]'));
  assert.equal(window.document.querySelector("dialog") === null, true); assert.equal(window.document.body.textContent.includes(person.documentNumber), false);
  assert.equal(options.signal.aborted, true); assert.equal(window.document.activeElement === ui.trigger, true);
});

test("closing while loading aborts the request and discards a late response", async context => {
  const request = pending(); const ui = await mount(context, () => request.promise);
  await ui.click(ui.trigger); const signal = ui.calls[0][1].signal;
  const cancel = new window.Event("cancel", { cancelable: true });
  await act(async () => window.document.querySelector("dialog").dispatchEvent(cancel));
  assert.equal(cancel.defaultPrevented, true); assert.equal(signal.aborted, true);
  await act(async () => request.resolve(response(details())));
  assert.equal(window.document.querySelector("dialog") === null, true); assert.equal(window.document.body.textContent.includes(person.documentNumber), false);
});

test("a failed details request can be retried without displaying stale private data", async context => {
  let attempt = 0; const ui = await mount(context, async () => ++attempt === 1 ? response({ error: "Accesso non disponibile" }, false) : response(details()));
  await ui.click(ui.trigger);
  assert.match(window.document.querySelector('[role="alert"]').textContent, /Accesso non disponibile/);
  assert.equal(window.document.body.textContent.includes(person.documentNumber), false);
  await ui.click([...window.document.querySelectorAll("button")].find(node => node.textContent === "Riprova"));
  assert.equal(ui.calls.length, 2); assert.equal(window.document.querySelector('[role="alert"]') === null, true);
  assert.ok(window.document.querySelector("dialog").textContent.includes(person.documentNumber));
});

test("mismatched participant data is rejected and missing historical information remains explicit", async context => {
  let attempt = 0; const ui = await mount(context, async () => response(++attempt === 1 ? details({ id: "another-person" }) : details({ documentNumber: "", contactAvailable: false, marketingConsent: null, activities: [] })));
  await ui.click(ui.trigger); assert.match(window.document.querySelector('[role="alert"]').textContent, /non corrispondono/);
  assert.equal(window.document.body.textContent.includes(person.documentNumber), false);
  await ui.click([...window.document.querySelectorAll("button")].find(node => node.textContent === "Riprova"));
  assert.match(window.document.querySelector("dialog").textContent, /iscrizione storica sono incompleti/);
  assert.match(window.document.querySelector("dialog").textContent, /Non disponibile/);
});
