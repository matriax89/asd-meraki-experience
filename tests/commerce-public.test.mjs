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
function compile(path, overrides = {}) {
  const exports = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, URL, Date, Set, JSON, console, AbortController, ...overrides, require: (name) => overrides.modules?.[name] || nativeFormControlMocks[name] || require(name) });
  return exports;
}
const attendeeModel = compile("../src/lib/commerce/attendee.ts");
const checkoutCopy = compile("../src/components/meraki/checkout-copy.ts");
const discountCopyModule = compile("../src/components/meraki/discount-copy.ts");
const localization = compile("../src/lib/commerce/localization.ts");
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const model = compile("../src/components/meraki/commerce-public-model.ts");
const tier = (id, amountCents, startsAt = null, endsAt = null) => ({ id, label: id, amountCents, startsAt, endsAt });
const config = {
  version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true,
  activities: [
    { id: "ws", name: "Workshop", kind: "workshop", capacity: 20, startsAt: "2099-08-01T08:00:00Z", salesEnd: null, menuOptions: [] },
    { id: "mc", name: "Masterclass", kind: "masterclass", capacity: 20, startsAt: "2099-08-01T10:00:00Z", salesEnd: null, menuOptions: [] },
    { id: "dinner", name: "Cena", kind: "dinner", capacity: 10, startsAt: "2099-08-01T18:00:00Z", salesEnd: "2099-07-30T18:00:00Z", menuOptions: ["Vegetariano", "Classico"] },
  ],
  packages: [
    { id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["ws"], prices: [tier("Standard", 3000)] },
    { id: "only-mc", name: "Solo Masterclass", description: "", activityIds: ["mc"], prices: [tier("Standard", 4000)] },
    { id: "bundle", name: "WS + MC", description: "", activityIds: ["ws", "mc"], prices: [tier("Standard", 6000)] },
  ],
  addons: [{ id: "add-dinner", name: "Aggiungi la cena", activityId: "dinner", amountCents: 2500 }],
};
const catalog = { config, availability: { ws: 20, mc: 20, dinner: 10 }, available: true, event: { id: "00000000-0000-4000-8000-000000000001", title: "Meraki Day", date: "2099-08-01T08:00:00Z" } };

test("price tiers switch precisely at their boundary and savings require all real solo prices", () => {
  const tiers = [tier("Early", 2000, null, "2099-07-01T00:00:00Z"), tier("Standard", 3000, "2099-07-01T00:00:00Z")];
  assert.equal(model.currentTier(tiers, Date.parse("2099-06-30T23:59:59Z")).amountCents, 2000);
  assert.equal(model.currentTier(tiers, Date.parse("2099-07-01T00:00:00Z")).amountCents, 3000);
  assert.equal(model.packageSavings(config, "bundle"), 1000);
  assert.equal(model.packageSavings({ ...config, packages: config.packages.filter((offer) => offer.id !== "only-mc") }, "bundle"), 0);
});

test("shared sold-out activities disable bundles and upgrades preserve existing access", () => {
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, mc: 0 } }, "bundle"), false);
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, mc: 0 } }, "bundle", ["mc"]), true);
  const offers = model.eligiblePackages(catalog, { packageId: "only-ws", activityIds: ["ws", "dinner"] });
  assert.deepEqual(Array.from(offers, (offer) => offer.id), ["only-ws", "bundle"]);
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, _event: 0 } }, "bundle"), false);
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, _event: 0 } }, "bundle", ["ws"]), true);
});

test("checkout redirects only accept exact Stripe hosts or the local success endpoint", () => {
  assert.equal(model.safeCommerceRedirect("https://checkout.stripe.com.attacker.test/session", "https://meraki.test"), null);
  assert.equal(model.safeCommerceRedirect("//attacker.test/api/checkout/success", "https://meraki.test"), null);
  assert.equal(model.safeCommerceRedirect("https://checkout.stripe.com/c/pay/test", "https://meraki.test"), "https://checkout.stripe.com/c/pay/test");
  assert.equal(model.safeCommerceRedirect("/api/checkout/success?session_id=cs_test", "https://meraki.test"), "https://meraki.test/api/checkout/success?session_id=cs_test");
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/eventi/example", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector("button,input")?.focus(); };
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
const { createRoot } = await import("react-dom/client");
after(() => { window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });

async function setup(context, result = catalog, locale = "it", upgrade = undefined, controls = {}) {
  window.document.body.innerHTML = '<div id="root"></div>';
  window.document.body.style.overflow = "auto";
  const calls = [];
  let rejectCatalog = false;
  let checkoutResponse = { error: "Pagamento non disponibile" };
  let uuidCalls = 1;
  let clockNow = Date.now(), clockTick;
  const TestDate = controls.manualClock ? class extends Date { static now() { return clockNow; } } : Date;
  if (controls.manualClock) {
    const originalInterval = window.setInterval, originalClearInterval = window.clearInterval;
    window.setInterval = (callback, delay, ...args) => delay === 30000 ? (clockTick = callback, -1) : originalInterval.call(window, callback, delay, ...args);
    window.clearInterval = (id) => { if (id !== -1) originalClearInterval.call(window, id); };
    context.after(() => { window.setInterval = originalInterval; window.clearInterval = originalClearInterval; });
  }
  let quoteResponse = (body) => ({ ok: true, json: async () => ({ quote: { totalCents: body.participants.reduce((sum, participant) => sum + (participant.packageId === "bundle" ? 6000 : 3000) + (participant.addonIds.length ? 2500 : 0), 0), lines: [{ label: "Riepilogo", quantity: 1, unitAmountCents: 3000, totalCents: 3000, kind: "package" }] } }) });
  const exports = compile("../src/components/meraki/commerce-purchase.tsx", {
    window, document: window.document, Date: TestDate, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, "0")}` },
    modules: {
      "./commerce-public-model": model, "./commerce-purchase.module.css": cssModule,
      "@/lib/commerce/localization": localization, "./discount-copy": discountCopyModule,
      "./discount-code-fields": compile("../src/components/meraki/discount-code-fields.tsx", { modules: { "./discount-copy": discountCopyModule, "./commerce-purchase.module.css": cssModule } }),
      "./checkout-copy": checkoutCopy, "@/lib/commerce/attendee": attendeeModel,
      "./checkout-contact-fields": compile("../src/components/meraki/checkout-contact-fields.tsx", { modules: { "./checkout-copy": checkoutCopy, "./commerce-purchase.module.css": cssModule } }),
      "./use-checkout-viewport": compile("../src/components/meraki/use-checkout-viewport.ts", { window, document: window.document, HTMLElement: window.HTMLElement }),
    },
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, body, options });
      if (url.startsWith("/api/commerce/catalog")) {
        if (rejectCatalog || result instanceof Error) throw new Error("offline");
        return { ok: true, json: async () => result };
      }
      if (url === "/api/commerce/quote") return quoteResponse(body, options);
      if (url === "/api/commerce/waitlist") return { ok: true, json: async () => ({ success: true }) };
      if (checkoutResponse instanceof Error) throw checkoutResponse;
      return { ok: false, json: async () => checkoutResponse };
    },
  });
  const root = createRoot(window.document.getElementById("root"));
  context.after(async () => act(async () => root.unmount()));
  await act(async () => root.render(React.createElement(exports.CommercePurchase, { eventId: catalog.event.id, locale, upgrade, ended: false, fallback: React.createElement("button", null, "Legacy checkout") })));
  const open = async () => act(async () => window.document.querySelector("button").click());
  const settleQuote = async () => act(async () => new Promise((resolve) => window.setTimeout(resolve, 300)));
  const change = async (element, value) => act(async () => { const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value); element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  const fillPerson = async (index = 0) => {
    await change(window.document.querySelector(`input[name="firstName-${index}"]`), index ? "Anna" : "Matias");
    await change(window.document.querySelector(`input[name="lastName-${index}"]`), "Lisio");
    await change(window.document.querySelector(`input[name="participant-${index}-email"]`), index ? "anna@example.test" : "matias@example.test");
    await change(window.document.querySelector(`input[name="participant-${index}-phone"]`), "+393331234567");
    await change(window.document.querySelector(`input[name="participant-${index}-document-number"]`), locale === "it" ? "RSSMRA85T10A562S" : "ABC123456");
  };
  return { calls, open, settleQuote, change, fillPerson, elapse: async (milliseconds) => { clockNow += milliseconds; await act(async () => clockTick?.()); await settleQuote(); }, setQuoteResponse: (value) => { quoteResponse = value; }, setCatalogOffline: () => { rejectCatalog = true; }, setCheckoutResponse: (value) => { checkoutResponse = value; } };
}

test("events with no commerce configuration preserve their existing purchase", async (context) => {
  await setup(context, { config: null });
  assert.equal(window.document.querySelector("button").textContent, "Legacy checkout");
});

test("catalog failures never expose the legacy checkout for a potentially configured event", async (context) => {
  await setup(context, new Error("offline"));
  assert.equal(window.document.body.textContent.includes("Legacy checkout"), false);
  assert.match(window.document.querySelector('[role="status"]').textContent, /Non è stato possibile verificare/);
  assert.equal(window.document.querySelector("button").textContent, "Riprova");
});

test("group purchase keeps independent formulas, optional dinner and menus for each person", async (context) => {
  const ui = await setup(context);
  await ui.open();
  assert.equal(window.document.querySelector("dialog").open, true);
  assert.equal(window.document.body.style.overflow, "hidden");
  await ui.change(window.document.querySelector('select[aria-label="Numero di partecipanti"]'), "2");
  assert.equal(window.document.querySelectorAll("fieldset").length, 2);
  const second = window.document.querySelectorAll("fieldset")[1];
  await act(async () => second.querySelector('input[value="bundle"]').click());
  await act(async () => second.querySelector('input[type="checkbox"]:not([role="switch"])').click());
  assert.equal(window.document.querySelectorAll('input[type="checkbox"]:checked').length, 1);
  const menu = [...second.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.textContent === "Vegetariano"));
  assert.ok(menu.required);
  await ui.change(menu, "Vegetariano");
  await ui.settleQuote();
  const quoted = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body;
  assert.equal(quoted.participants[0].packageId, "only-ws");
  assert.deepEqual(quoted.participants[0].addonIds, []);
  assert.equal(quoted.participants[1].packageId, "bundle");
  assert.deepEqual(quoted.participants[1].addonIds, ["add-dinner"]);
  assert.equal(quoted.participants[1].menuChoices.dinner, "Vegetariano");
  assert.match(window.document.querySelector("form").textContent, /115,00/);
  await act(async () => second.querySelector('input[type="checkbox"]:not([role="switch"])').click());
  await ui.settleQuote();
  assert.deepEqual(ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.participants[1].menuChoices, {});
  await act(async () => window.document.querySelector('button[aria-label="Chiudi acquisto"]').click());
  assert.equal(window.document.body.style.overflow, "auto");
});

test("sold-out events offer a separate no-payment waitlist and send the requested formula", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 0, mc: 0, dinner: 0 } });
  assert.match(window.document.querySelector("button").textContent, /lista d’attesa/);
  await ui.open();
  await act(async () => window.document.querySelector('input[value="bundle"]').click());
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const request = ui.calls.find((call) => call.url === "/api/commerce/waitlist");
  assert.equal(request.body.packageId, "bundle");
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
  assert.match(window.document.querySelector('[role="status"]').textContent, /Sei in lista d’attesa/);
});

test("an unavailable formula has its own waitlist even while other formulas remain purchasable", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 20, mc: 0, dinner: 10 } });
  await ui.open();
  const waitlistButton = [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Avvisami per Solo Masterclass");
  assert.ok(waitlistButton);
  await act(async () => waitlistButton.click());
  assert.match(window.document.querySelector("h2").textContent, /prossimo posto/);
  assert.equal(window.document.querySelector('input[value="only-mc"]').checked, true);
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(ui.calls.find((call) => call.url === "/api/commerce/waitlist").body.packageId, "only-mc");
});

test("a group checkout submits the authoritative selection once despite two rapid submissions", async (context) => {
  const ui = await setup(context);
  await ui.open();
  await ui.settleQuote();
  await ui.fillPerson();
  await ui.settleQuote();
  const form = window.document.querySelector("form");
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  const requests = ui.calls.filter((call) => call.url === "/api/commerce/checkout");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.participants.length, 1);
  assert.equal(requests[0].body.participants[0].packageId, "only-ws");
  assert.equal(requests[0].body.buyerEmail, "matias@example.test");
  assert.equal(requests[0].body.attendees[0].email, "matias@example.test");
  assert.equal(requests[0].body.attendees[0].phone, "+393331234567");
  assert.equal(requests[0].body.attendees[0].documentType, "codice_fiscale");
  assert.equal(requests[0].body.attendees[0].marketingConsent, false);
  const latestQuote = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body;
  assert.equal("attendees" in latestQuote, false);
  assert.equal("email" in latestQuote.participants[0], false);
  assert.equal(requests[0].body.checkoutAttemptId, "00000000-0000-4000-8000-000000000002");
  assert.equal(requests[0].body.expectedTotalCents, 3000);
  assert.match(window.document.querySelector('[role="alert"]').textContent, /Pagamento non disponibile/);
  assert.equal(window.document.querySelector("dialog").open, true);
});

test("a price change displays the authoritative new total and requires explicit confirmation", async (context) => {
  const ui = await setup(context);
  await ui.open();
  await ui.settleQuote();
  await ui.fillPerson();
  await ui.settleQuote();
  ui.setCheckoutResponse({ code: "price_changed", quote: { totalCents: 3500, lines: [{ label: "Nuovo scaglione", quantity: 1, unitAmountCents: 3500, totalCents: 3500, kind: "package" }] } });
  const form = window.document.querySelector("form");
  const submit = () => act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await submit();
  assert.match(window.document.querySelector('[role="alert"]').textContent, /prezzo è cambiato/);
  assert.match(form.textContent, /35,00/);
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/checkout").length, 1);
  assert.equal(window.location.pathname, "/it/eventi/example");
  ui.setCheckoutResponse({ error: "Pagamento non disponibile" });
  await submit();
  const requests = ui.calls.filter((call) => call.url === "/api/commerce/checkout");
  assert.equal(requests[1].body.expectedTotalCents, 3500);
  assert.notEqual(requests[1].body.checkoutAttemptId, requests[0].body.checkoutAttemptId);
});

test("payment confirmation displays every named participant without redirecting to only the first", async (context) => {
  window.document.body.innerHTML = '<div id="payment-root"></div>';
  const result = { status: "ready", url: "/it/biglietto/00000000-0000-4000-8000-000000000001?token=one", tickets: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Matias Lisio", title: "Workshop + Masterclass", url: "/it/biglietto/00000000-0000-4000-8000-000000000001?token=one" },
    { id: "00000000-0000-4000-8000-000000000002", name: "Anna Rossi", title: "Workshop", url: "/it/biglietto/00000000-0000-4000-8000-000000000002?token=two" },
  ] };
  const Anchor = ({ children, href }) => React.createElement("a", { href }, children);
  const payment = compile("../src/app/[locale]/(public)/pagamento/payment-status.tsx", {
    window, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => result }),
    modules: { "@/i18n/routing": { Link: Anchor }, "next/link": { default: Anchor, __esModule: true }, "@/lib/tickets/view-copy": compile("../src/lib/tickets/view-copy.ts") },
  });
  const root = createRoot(window.document.getElementById("payment-root"));
  context.after(async () => act(async () => root.unmount()));
  await act(async () => root.render(React.createElement(payment.PaymentStatus, { sessionId: "cs_test_group" })));
  const links = [...window.document.querySelectorAll('a[href*="/biglietto/"]')];
  assert.equal(links.length, 2);
  assert.match(links[0].textContent, /Matias Lisio/);
  assert.match(links[1].textContent, /Anna Rossi/);
  assert.match(window.document.querySelector("h1").textContent, /vostri biglietti/);
  assert.equal(window.location.pathname, "/it/eventi/example");
});


test("guest checkout keeps optional consent separate for each participant", async (context) => {
  const ui = await setup(context);
  await ui.open();
  await ui.change(window.document.querySelector('select[aria-label="Numero di partecipanti"]'), "2");
  await ui.fillPerson(0);
  await ui.fillPerson(1);
  const toggles = [...window.document.querySelectorAll('input[role="switch"]')];
  assert.equal(toggles.length, 2);
  assert.ok(toggles.every((toggle) => !toggle.checked && !toggle.required));
  await act(async () => toggles[0].click());
  await ui.settleQuote();
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const request = ui.calls.find((call) => call.url === "/api/commerce/checkout").body;
  assert.equal(request.attendees[0].marketingConsent, true);
  assert.equal(request.attendees[1].marketingConsent, false);
  assert.equal(request.attendees[1].email, "anna@example.test");
  assert.ok(window.document.querySelector('a[href="/it/legal/privacy-policy"]'));
});

for (const [locale, title, emailLabel] of [["en", "Make it your moment.", "Email for the ticket"], ["de", "Gestalte deinen Moment.", "E-Mail für das Ticket"], ["es", "Crea tu momento.", "Email para la entrada"]]) {
  test(`${locale} localizes checkout, foreign identity fields and payment failures`, async (context) => {
    const ui = await setup(context, catalog, locale);
    await ui.open();
    assert.equal(window.document.querySelector("h2").textContent, title);
    assert.match(window.document.querySelector('label[for="participant-0-email"]').textContent, new RegExp(emailLabel));
    assert.equal(window.document.querySelector('select[name="participant-0-document-type"]').value, "foreign_id");
    await ui.fillPerson();
    await ui.settleQuote();
    await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    const request = ui.calls.find((call) => call.url === "/api/commerce/checkout").body;
    assert.equal(request.locale, locale);
    assert.equal(request.attendees[0].documentType, "foreign_id");
    assert.equal(window.document.querySelector('[role="alert"]').textContent.includes("Pagamento non disponibile"), false);
  });
}

test("keyboard viewport resizing constrains the whole dialog and reveals the focused input", async (context) => {
  const viewport = new window.EventTarget();
  viewport.height = 844; viewport.offsetTop = 0;
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  context.after(() => { delete window.visualViewport; });
  const ui = await setup(context);
  await ui.open();
  const dialog = window.document.querySelector("dialog");
  const scroller = dialog.querySelector("[data-checkout-scroll]");
  const input = dialog.querySelector('input[name="participant-0-document-number"]');
  scroller.getBoundingClientRect = () => ({ top: 100, bottom: 350 });
  input.getBoundingClientRect = () => ({ top: 420, bottom: 470 });
  input.focus();
  await act(async () => { viewport.height = 350; viewport.offsetTop = 36; viewport.dispatchEvent(new window.Event("resize")); await new Promise((resolve) => window.setTimeout(resolve, 40)); });
  assert.equal(dialog.style.getPropertyValue("--checkout-viewport-height"), "350px");
  assert.equal(dialog.style.getPropertyValue("--checkout-viewport-top"), "36px");
  assert.ok(scroller.scrollTop > 0, "The focused field scrolls above the keyboard");
  await act(async () => dialog.close());
  assert.equal(dialog.style.getPropertyValue("--checkout-viewport-height"), "");
});


test("verified upgrade preserves existing attendee details without requesting tax identifiers again", async (context) => {
  const upgrade = { passId: "00000000-0000-4000-8000-000000000002", token: "private-pass-token", firstName: "Matias", lastName: "Lisio", packageId: "only-ws", activityIds: ["ws"], contact: { email: "original@example.test" } };
  const ui = await setup(context, catalog, "it", upgrade);
  await ui.open();
  assert.equal(window.document.querySelector('input[name="firstName-0"]').readOnly, true);
  assert.equal(window.document.querySelector('input[name="participant-0-email"]').value, "original@example.test");
  assert.equal(window.document.querySelector('input[name="participant-0-document-number"]'), null);
  assert.equal(window.document.querySelector('input[role="switch"]'), null);
  await act(async () => window.document.querySelector('input[value="bundle"]').click());
  await ui.settleQuote();
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const request = ui.calls.find((call) => call.url === "/api/commerce/checkout").body;
  assert.equal(request.buyerEmail, "original@example.test");
  assert.equal("attendees" in request, false);
  assert.equal(request.upgradePassId, upgrade.passId);
});


test("discount application and removal keep the server total and block stale payment", async (context) => {
  const ui = await setup(context);
  await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  ui.setQuoteResponse((body) => ({ ok: true, json: async () => ({ quote: { subtotalCents: 3000, discountCents: body.discountCode ? 600 : 0, totalCents: body.discountCode ? 2400 : 3000, discount: body.discountCode ? { code: body.discountCode, targetType: "activity", targetIds: ["ws"] } : null, lines: [{ label: "Solo Workshop", packageId: "only-ws", tierId: "Standard", quantity: 1, subtotalCents: 3000, totalCents: body.discountCode ? 2400 : 3000, kind: "package" }] } }) }));
  await ui.change(window.document.querySelector('input[name="discountCode"]'), " meraki20 ");
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Applica").click());
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  await ui.settleQuote();
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.discountCode, "MERAKI20");
  assert.match(window.document.querySelector("form").textContent, /Subtotale30,00/);
  assert.match(window.document.querySelector("form").textContent, /Sconto.*MERAKI20.*Workshop.*6,00/);
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const paid = ui.calls.filter((call) => call.url === "/api/commerce/checkout").at(-1).body;
  assert.equal(paid.discountCode, "MERAKI20"); assert.equal(paid.expectedTotalCents, 2400);
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Rimuovi").click());
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  await ui.settleQuote();
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.discountCode, undefined);
  assert.equal(window.document.querySelector('input[name="discountCode"]').value, "");
  assert.match(window.document.querySelector("form").textContent, /Totale30,00/);
});

test("invalid discount errors are localized and cannot silently charge the full price", async (context) => {
  const ui = await setup(context, catalog, "de"); await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  ui.setQuoteResponse(() => ({ ok: false, json: async () => ({ code: "discount_not_applicable", error: "Codice non applicabile" }) }));
  await ui.change(window.document.querySelector('input[name="discountCode"]'), "wrong");
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Anwenden").click()); await ui.settleQuote();
  assert.match(window.document.querySelector('[role="alert"]').textContent, /gilt nicht für deine aktuelle Auswahl/);
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
});

test("a late quote for an old discount cannot replace a newer selection", async (context) => {
  const ui = await setup(context); await ui.open(); await ui.settleQuote();
  let resolveOld;
  ui.setQuoteResponse((body) => body.participants[0].packageId === "only-ws" ? new Promise((resolve) => { resolveOld = resolve; }) : ({ ok: true, json: async () => ({ quote: { totalCents: 5400, subtotalCents: 6000, discountCents: 600, discount: { code: "CODE" }, lines: [] } }) }));
  await ui.change(window.document.querySelector('input[name="discountCode"]'), "code");
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Applica").click()); await ui.settleQuote();
  await act(async () => window.document.querySelector('input[value="bundle"]').click()); await ui.settleQuote();
  await act(async () => resolveOld({ ok: true, json: async () => ({ quote: { totalCents: 999, lines: [] } }) }));
  assert.match(window.document.querySelector("form").textContent, /Totale54,00/);
  assert.equal(window.document.querySelector("form").textContent.includes("9,99"), false);
});

test("the selected language translates formulas, tiers, extras and menu labels without changing menu values", async (context) => {
  const translated = structuredClone(catalog);
  translated.config.packages[0].nameTranslations = { en: "Workshop admission" };
  translated.config.packages[0].descriptionTranslations = { en: "Move with us" };
  translated.config.packages[0].prices[0].labelTranslations = { en: "Regular price" };
  translated.config.addons[0].nameTranslations = { en: "Add dinner" };
  translated.config.activities[2].nameTranslations = { en: "Dinner" };
  translated.config.activities[2].menuTranslations = { Vegetariano: { en: "Vegetarian" } };
  const ui = await setup(context, translated, "en"); await ui.open();
  assert.match(window.document.querySelector("form").textContent, /Workshop admission.*Move with us.*Regular price/s);
  assert.match(window.document.querySelector("form").textContent, /Add dinner/);
  await act(async () => window.document.querySelector('input[type="checkbox"]:not([role="switch"])').click());
  const menu = [...window.document.querySelectorAll("select")].find((element) => [...element.options].some((option) => option.textContent === "Vegetarian"));
  assert.ok(menu); await ui.change(menu, "Vegetariano"); await ui.settleQuote();
  const latest = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body;
  assert.equal(latest.locale, "en"); assert.equal(latest.participants[0].menuChoices.dinner, "Vegetariano");
  assert.match(ui.calls.find((call) => call.url.startsWith("/api/commerce/catalog")).url, /locale=en/);
});

for (const locale of ["en", "es"]) test(`${locale} keeps sale deadlines in Italian 24-hour Rome time`, async (context) => {
  const dated = structuredClone(catalog);
  dated.config.packages[0].prices[0].endsAt = "2099-05-01T22:30:00Z";
  dated.config.activities[2].salesEnd = "2099-05-01T22:30:00Z";
  const ui = await setup(context, dated, locale); await ui.open();
  const text = window.document.querySelector("form").textContent;
  assert.match(text, locale === "es" ? /hasta el 02\/05\/2099, 00:30/ : /until 02\/05\/2099, 00:30/);
  assert.match(text, locale === "es" ? /Reserva antes del 2 mag, 00:30/ : /Book by 2 mag, 00:30/);
  assert.equal(/10:30 PM|22:30/.test(text), false);
});

const scheduledPriceCatalog = () => {
  const dated = structuredClone(catalog);
  dated.config.packages[0].prices = [
    { ...tier("early", 4500, null, "2099-05-01T22:30:00Z"), label: "Early Bird", labelTranslations: { de: "Frühbucher" } },
    { ...tier("regular", 5500, "2099-05-01T22:30:00Z"), label: "Standard", labelTranslations: { en: "Regular", de: "Regulär", es: "Estándar" } },
  ];
  return dated;
};

for (const locale of ["it", "en", "de", "es"]) test(`${locale} distinguishes the current tier, its full Rome deadline and the next scheduled price saving`, async (context) => {
  const ui = await setup(context, scheduledPriceCatalog(), locale); await ui.open();
  const card = window.document.querySelector('input[value="only-ws"]').closest("label");
  const copy = checkoutCopy.checkoutCopy(locale);
  assert.equal(card.querySelector(".tierPill").textContent, locale === "de" ? "Frühbucher" : "Early Bird");
  assert.match(card.querySelector(".offerPrice").textContent, /45,00\s*€/);
  const expiry = card.querySelector("[data-tier-deadline]");
  assert.equal(expiry.getAttribute("data-tier-deadline"), "2099-05-01T22:30:00Z");
  assert.ok(expiry.textContent.includes(copy.until)); assert.match(expiry.textContent, /02\/05\/2099, 00:30/);
  assert.ok(expiry.textContent.includes(copy.italianTime));
  const next = card.querySelector("[data-next-tier-comparison]");
  assert.ok(next.textContent.includes(copy.nextPriceFrom)); assert.match(next.textContent, /02\/05\/2099, 00:30/);
  assert.match(next.querySelector(".nextPriceAmount").textContent, /55,00\s*€/);
  assert.ok(next.textContent.includes(locale === "en" ? "Regular" : locale === "de" ? "Regulär" : locale === "es" ? "Estándar" : "Standard"));
  assert.match(next.querySelector(".tierSavings").textContent, /−18,1%/);
  assert.ok(next.querySelector(".tierSavings").textContent.includes(copy.nextPriceSaving));
  assert.match(next.querySelector(".tierSavingAmount").textContent, /10,00\s*€/);
  assert.equal(card.querySelector("s, del"), null, "a future price is not presented as a crossed-out past price");
  assert.equal(card.querySelectorAll("input, button, a, select").length, 1, "the radio label contains no nested interactive price controls");
  const bundle = window.document.querySelector('input[value="bundle"]').closest("label");
  assert.ok(bundle.querySelector(".bundleSavings").textContent.includes(copy.bundleSavings));
  assert.ok(bundle.querySelector(".bundleSavings").textContent.includes(copy.bundleSavingsCompared));
});

test("a tier with no next scheduled price never invents a future price or deadline", async (context) => {
  const ui = await setup(context); await ui.open();
  assert.equal(window.document.querySelector("[data-next-tier-comparison]"), null);
  assert.equal(window.document.querySelector("[data-tier-deadline]"), null);
  assert.equal(window.document.querySelector(".tierSavings"), null);
  assert.ok(window.document.querySelector(".tierPill"), "the real current tier remains visible without a promotion");
});

test("the displayed tier and comparison update when the scheduled price boundary passes", async (context) => {
  const ui = await setup(context, scheduledPriceCatalog(), "it", undefined, { manualClock: true }); await ui.open();
  const card = () => window.document.querySelector('input[value="only-ws"]').closest("label");
  assert.equal(card().querySelector(".tierPill").textContent, "Early Bird");
  assert.ok(card().querySelector("[data-next-tier-comparison]"));
  await ui.elapse(Date.parse("2099-05-01T22:30:01Z") - Date.now());
  assert.equal(card().querySelector(".tierPill").textContent, "Standard");
  assert.match(card().querySelector(".offerPrice").textContent, /55,00\s*€/);
  assert.equal(card().querySelector("[data-next-tier-comparison], [data-tier-deadline], .tierSavings"), null);
});

for (const nextAmount of [4500, 4000]) test(`a next price of ${nextAmount} cents does not claim a saving against the current 4500 cents`, async (context) => {
  const dated = scheduledPriceCatalog(); dated.config.packages[0].prices[1].amountCents = nextAmount;
  const ui = await setup(context, dated); await ui.open();
  const card = window.document.querySelector('input[value="only-ws"]').closest("label");
  assert.equal(card.querySelector(".tierSavings"), null);
  assert.equal(card.textContent.includes("rispetto al prossimo prezzo"), false);
  assert.ok(card.querySelector(".nextPriceAmount").textContent.includes(nextAmount === 4500 ? "45,00" : "40,00"), "the actual scheduled price remains informative without a fake discount");
});

test("an unavailable formula and a waitlist never advertise a saving on a future price", async (context) => {
  const sold = scheduledPriceCatalog(); sold.availability.ws = 0;
  const ui = await setup(context, sold); await ui.open();
  const card = window.document.querySelector('input[value="only-ws"]').closest("label");
  assert.equal(card.querySelector("input").disabled, true);
  assert.equal(card.querySelector("[data-next-tier-comparison]"), null);
  const waitlist = [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Avvisami per Solo Workshop");
  await act(async () => waitlist.click());
  assert.equal(window.document.querySelector("[data-next-tier-comparison]"), null);
  assert.equal(window.document.querySelector(".tierSavings, .bundleSavings, .tierPill"), null);
});

test("an upgrade never mixes the full package price saving with the payable difference", async (context) => {
  const upgrade = { passId: "00000000-0000-4000-8000-000000000002", token: "private-pass-token", firstName: "Matias", lastName: "Lisio", packageId: "only-ws", activityIds: ["ws"] };
  const dated = scheduledPriceCatalog();
  dated.config.packages[2].prices = [{ ...tier("early", 6500, null, "2099-05-01T22:30:00Z"), label: "Early Bird" }, tier("next", 8500, "2099-05-01T22:30:00Z")];
  const ui = await setup(context, dated, "it", upgrade); await ui.open();
  assert.equal(window.document.querySelector("[data-next-tier-comparison]"), null);
  assert.equal(window.document.querySelector(".tierSavings, .bundleSavings"), null);
  assert.ok(window.document.querySelector("dialog").textContent.includes("Già acquistata"));
});


test("an ambiguous discounted checkout keeps its frozen total and UUID across automatic 30-second checks", async (context) => {
  const ui = await setup(context, catalog, "it", undefined, { manualClock: true });
  await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  let held = false;
  const acceptedQuote = { subtotalCents: 3000, discountCents: 600, totalCents: 2400, discount: { code: "ONLYONCE" }, lines: [{ label: "Workshop", quantity: 1, totalCents: 2400, kind: "package" }] };
  ui.setQuoteResponse(() => held ? ({ ok: false, json: async () => ({ code: "discount_exhausted", error: "Codice esaurito" }) }) : ({ ok: true, json: async () => ({ quote: acceptedQuote }) }));
  await ui.change(window.document.querySelector('input[name="discountCode"]'), "onlyonce");
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Applica").click()); await ui.settleQuote();
  ui.setCheckoutResponse(new Error("Network timeout"));
  const submit = () => act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await submit(); held = true;
  const before = ui.calls.filter((call) => call.url === "/api/commerce/quote").length;
  await ui.elapse(30000);
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").length, before, "Do not count this attempt’s own held use as a new application");
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, false);
  assert.match(window.document.querySelector("form").textContent, /Totale24,00/);
  await submit();
  const requests = ui.calls.filter((call) => call.url === "/api/commerce/checkout");
  assert.equal(requests.length, 2); assert.equal(requests[1].body.checkoutAttemptId, requests[0].body.checkoutAttemptId);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(requests[1].body.expectedTotalCents, 2400); assert.equal(requests[1].body.discountCode, "ONLYONCE");
  await ui.change(window.document.querySelector('input[name="participant-0-phone"]'), "+393331111222");
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  await ui.settleQuote();
  assert.match(window.document.querySelector('[role="alert"]').textContent, /limite di utilizzi/);
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
});

test("a deterministic checkout rejection clears the held quote and checks the code again", async (context) => {
  const ui = await setup(context, catalog, "it", undefined, { manualClock: true }); await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  ui.setCheckoutResponse({ code: "request_expired", error: "Prenotazione scaduta" });
  const before = ui.calls.filter((call) => call.url === "/api/commerce/quote").length;
  const submit = () => act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await submit(); assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  await ui.settleQuote();
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").length, before + 1);
  ui.setCheckoutResponse(new Error("Network timeout")); await submit();
  const requests = ui.calls.filter((call) => call.url === "/api/commerce/checkout");
  assert.notEqual(requests[1].body.checkoutAttemptId, requests[0].body.checkoutAttemptId);
});
