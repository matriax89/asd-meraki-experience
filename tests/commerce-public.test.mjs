import { dateFormatModule } from "./helpers/date-format-modules.mjs";
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
  vm.runInNewContext(compiled, { exports, URL, Date, Set, JSON, console, AbortController, ...overrides, require: (name) => overrides.modules?.[name] || nativeFormControlMocks[name] || (name === "@/lib/events/date-format" ? dateFormatModule : require(name)) });
  return exports;
}
const attendeeModel = compile("../src/lib/commerce/attendee.ts");
const checkoutCopy = compile("../src/components/meraki/checkout-copy.ts");
const discountCopyModule = compile("../src/components/meraki/discount-copy.ts");
const localization = compile("../src/lib/commerce/localization.ts");
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const model = compile("../src/components/meraki/commerce-public-model.ts");
const eventModel = compile("../src/components/meraki/event-model.ts");
const eventPriceSummary = compile("../src/components/meraki/event-price-summary.tsx", { modules: { "@/lib/commerce/localization": localization, "./commerce-public-model": model, "./event-model": eventModel } });
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
  assert.deepEqual(Array.from(offers, (offer) => offer.id), ["bundle", "only-ws"]);
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, _event: 0 } }, "bundle"), false);
  assert.equal(model.packageAvailable({ ...catalog, availability: { ...catalog.availability, _event: 0 } }, "bundle", ["ws"]), true);
});

test("combo prioritization is stable and never mutates the configured package order", () => {
  const input = Object.freeze([{ id: "solo-a", activityIds: ["a"] }, { id: "combo-a", activityIds: ["a", "b"] }, { id: "plain" }, { id: "combo-b", activityIds: ["b", "c"] }, { id: "solo-b", activityIds: ["b"] }]);
  const sorted = model.prioritizePackages(input);
  assert.deepEqual(Array.from(sorted, (offer) => offer.id), ["combo-a", "combo-b", "solo-a", "plain", "solo-b"]);
  assert.deepEqual(input.map((offer) => offer.id), ["solo-a", "combo-a", "plain", "combo-b", "solo-b"]);
  assert.equal(sorted[0], input[1]);
});

test("checkout redirects accept Stripe's standard host and Meraki's configured custom payment domain", () => {
  assert.equal(model.safeCommerceRedirect("https://checkout.stripe.com/c/pay/test", "https://meraki.test"), "https://checkout.stripe.com/c/pay/test");
  const custom = "https://pay.merakiexperience.org/c/pay/cs_live_placeholder#fidkdWxOYHwnPyd1blpxYHZxWjA0";
  assert.equal(model.safeCommerceRedirect(custom, "https://www.merakiexperience.org"), custom, "Stripe's session path and fragment stay unchanged");
  assert.equal(model.safeCommerceRedirect("https://pay.merakiexperience.org:443/c/pay/test", "https://meraki.test"), "https://pay.merakiexperience.org/c/pay/test");
});

test("checkout redirects reject lookalike hosts, subdomains, credentials, nonstandard ports and insecure payment URLs", () => {
  for (const value of [
    "https://checkout.stripe.com.attacker.test/session", "https://pay.merakiexperience.org.attacker.test/session",
    "https://other.merakiexperience.org/c/pay/test", "https://nested.pay.merakiexperience.org/c/pay/test", "https://other.stripe.com/c/pay/test",
    "https://checkout.stripe.com@attacker.test/session", "https://user:secret@checkout.stripe.com/c/pay/test", "https://user@pay.merakiexperience.org/c/pay/test", "https://:secret@pay.merakiexperience.org/c/pay/test",
    "https://checkout.stripe.com:444/c/pay/test", "https://pay.merakiexperience.org:8443/c/pay/test",
    "http://checkout.stripe.com/c/pay/test", "http://pay.merakiexperience.org/c/pay/test",
    "//attacker.test/api/checkout/success", "https://attacker.test/api/checkout/success",
  ]) assert.equal(model.safeCommerceRedirect(value, "https://meraki.test"), null, value);
});

test("checkout completion accepts only the local success endpoint, including HTTP local development", () => {
  assert.equal(model.safeCommerceRedirect("/api/checkout/success?session_id=cs_test", "https://meraki.test"), "https://meraki.test/api/checkout/success?session_id=cs_test");
  assert.equal(model.safeCommerceRedirect("/api/checkout/success?session_id=cs_test", "http://localhost:3013"), "http://localhost:3013/api/checkout/success?session_id=cs_test");
  assert.equal(model.safeCommerceRedirect("https://user:secret@meraki.test/api/checkout/success", "https://meraki.test"), null);
  assert.equal(model.safeCommerceRedirect("/api/checkout/other?session_id=cs_test", "https://meraki.test"), null);
  assert.equal(model.safeCommerceRedirect("https://meraki.test:8443/api/checkout/success", "https://meraki.test"), null);
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
  const redirects = [];
  let rejectCatalog = false;
  let checkoutResponse = { error: "Pagamento non disponibile" };
  let checkoutOk = false;
  let uuidCalls = 1;
  let clockNow = Date.now(), clockTick;
  const TestDate = controls.manualClock ? class extends Date { static now() { return clockNow; } } : Date;
  if (controls.manualClock) {
    const originalInterval = window.setInterval, originalClearInterval = window.clearInterval;
    window.setInterval = (callback, delay, ...args) => delay === 30000 ? (clockTick = callback, -1) : originalInterval.call(window, callback, delay, ...args);
    window.clearInterval = (id) => { if (id !== -1) originalClearInterval.call(window, id); };
    context.after(() => { window.setInterval = originalInterval; window.clearInterval = originalClearInterval; });
  }
  const componentWindow = controls.captureNavigation ? new Proxy(window, { get(target, key) {
    if (key === "location") return { origin: target.location.origin, assign: (url) => redirects.push(url) };
    return Reflect.get(target, key, target);
  } }) : window;
  let quoteResponse = (body) => ({ ok: true, json: async () => ({ quote: { totalCents: body.participants.reduce((sum, participant) => sum + (participant.packageId === "bundle" ? 6000 : 3000) + (participant.addonIds.length ? 2500 : 0), 0), lines: [{ label: "Riepilogo", quantity: 1, unitAmountCents: 3000, totalCents: 3000, kind: "package" }] } }) });
  const exports = compile("../src/components/meraki/commerce-purchase.tsx", {
    window: componentWindow, document: window.document, Date: TestDate, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, "0")}` },
    modules: {
      "./commerce-public-model": model, "./commerce-purchase.module.css": cssModule,
      "./event-price-summary": eventPriceSummary,
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
      return { ok: checkoutOk, json: async () => checkoutResponse };
    },
  });
  const root = createRoot(window.document.getElementById("root"));
  context.after(async () => act(async () => root.unmount()));
  await act(async () => root.render(React.createElement(exports.CommercePurchase, { eventId: catalog.event.id, locale, upgrade, ended: controls.ended || false, presentation: controls.presentation, fallback: React.createElement("button", null, "Legacy checkout") })));
  const open = async () => act(async () => (window.document.querySelector("[data-commerce-package-presentation] .packagePurchaseAction button") || window.document.querySelector("button")).click());
  const settleQuote = async () => act(async () => new Promise((resolve) => window.setTimeout(resolve, 300)));
  const change = async (element, value) => act(async () => { const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value); element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  const fillPerson = async (index = 0) => {
    await change(window.document.querySelector(`input[name="firstName-${index}"]`), index ? "Anna" : "Matias");
    await change(window.document.querySelector(`input[name="lastName-${index}"]`), "Lisio");
    await change(window.document.querySelector(`input[name="participant-${index}-email"]`), index ? "anna@example.test" : "matias@example.test");
    await change(window.document.querySelector(`input[name="participant-${index}-phone"]`), "+393331234567");
    await change(window.document.querySelector(`input[name="participant-${index}-document-number"]`), locale === "it" ? "RSSMRA85T10A562S" : "ABC123456");
  };
  return { calls, redirects, open, settleQuote, change, fillPerson, elapse: async (milliseconds) => { clockNow += milliseconds; await act(async () => clockTick?.()); await settleQuote(); }, setQuoteResponse: (value) => { quoteResponse = value; }, setCatalogOffline: () => { rejectCatalog = true; }, setCheckoutResponse: (value, options = {}) => { checkoutResponse = value; checkoutOk = options.ok === true; } };
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

test("a new purchase selects the first available combo and the quote uses that exact package", async (context) => {
  const ui = await setup(context); await ui.open(); await ui.settleQuote();
  const radios = [...window.document.querySelectorAll('input[name="package-0"]')];
  assert.deepEqual(radios.map((input) => input.value), ["bundle", "only-ws", "only-mc"]);
  assert.equal(radios[0].checked, true);
  assert.ok(radios[0].closest("label").classList.contains("selectedPackageOption"));
  assert.equal(radios[0].closest("label").getAttribute("data-package-combo"), "true");
  assert.equal(radios[1].closest("label").hasAttribute("data-package-combo"), false);
  const request = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1);
  assert.equal(request.body.participants[0].packageId, "bundle");
  assert.match(window.document.querySelector("form").textContent, /Totale60,00/);
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
});

test("the available selected solo precedes a sold-out combo without requesting an invalid bundle", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 20, mc: 0, dinner: 10 } }); await ui.open(); await ui.settleQuote();
  const radios = [...window.document.querySelectorAll('input[name="package-0"]')];
  assert.equal(radios[0].value, "only-ws"); assert.equal(radios[0].checked, true);
  assert.equal(radios[1].value, "bundle"); assert.equal(radios[1].disabled, true);
  assert.equal(window.document.querySelector('input[value="only-ws"]').checked, true);
  assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.participants[0].packageId, "only-ws");
});

for (const [locale, purchase] of [["it", "Acquista quota partecipazione"], ["en", "Buy ticket"], ["de", "Ticket kaufen"], ["es", "Comprar entrada"]]) {
  test(`${locale} inline prices show the complete combo-first list and open the translated purchase flow`, async (context) => {
    const ui = await setup(context, scheduledPriceCatalog(), locale, undefined, { presentation: "packages" });
    const presentation = window.document.querySelector("[data-commerce-package-presentation]");
    assert.ok(presentation.querySelector("h2"));
    assert.equal(presentation.querySelector(".price, .eyebrow"), null, "The old minimum-price card is absent");
    const offers = [...presentation.querySelectorAll("[data-event-package-price]")];
    assert.deepEqual(offers.map((offer) => offer.getAttribute("data-event-package-price")), ["bundle", "only-ws", "only-mc"]);
    assert.equal(offers[0].getAttribute("data-package-combo"), "true");
    assert.match(offers[0].className, /bg-\[#17281f\].*text-white/);
    assert.match(offers[1].querySelector("[data-price-saving]").textContent, /18,1%/);
    const trigger = presentation.querySelector(".packagePurchaseAction button");
    assert.equal(trigger.textContent, purchase); assert.equal(trigger.disabled, false);
    await ui.open(); await ui.settleQuote();
    assert.equal(window.document.querySelector("dialog").open, true);
    assert.equal(ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.participants[0].packageId, "bundle");
    assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
  });
}

for (const [packageId, amount] of [["only-ws", 3000], ["only-mc", 4000], ["bundle", 6000]]) {
  test(`clicking the ${packageId} price card opens checkout with its exact package and authoritative quote`, async (context) => {
    const ui = await setup(context, catalog, "it", undefined, { presentation: "packages" });
    ui.setQuoteResponse((body) => {
      const selected = config.packages.find((offer) => offer.id === body.participants[0].packageId);
      return { ok: true, json: async () => ({ quote: { totalCents: selected.prices[0].amountCents, lines: [{ label: selected.name, quantity: 1, unitAmountCents: selected.prices[0].amountCents, totalCents: selected.prices[0].amountCents, kind: "package", packageId: selected.id }] } }) };
    });
    const card = window.document.querySelector(`[data-event-package-price="${packageId}"]`);
    assert.equal(card.tagName, "BUTTON");
    await act(async () => card.click());
    await ui.settleQuote();
    assert.equal(window.document.querySelector("dialog").open, true);
    assert.equal(window.document.querySelector('input[name="package-0"]:checked').value, packageId);
    const options = [...window.document.querySelectorAll('input[name="package-0"]')];
    assert.equal(options[0].value, packageId, "The chosen formula is first in the actual accessible list");
    assert.equal(options[0].closest("label").dataset.packageSelected, "true");
    assert.ok(options[0].closest("label").classList.contains("selectedPackageOption"));
    assert.ok(options.slice(1).every((option) => option.closest("label").classList.contains("unselectedPackageOption")), "Every alternative, including the combo, has the neutral gray treatment");
    const requested = ui.calls.filter((call) => call.url === "/api/commerce/quote");
    assert.ok(requested.length > 0);
    assert.ok(requested.every((call) => call.body.participants[0].packageId === packageId), "No request may use the previously selected formula");
    assert.match(window.document.querySelector(".total").textContent, new RegExp(String(amount / 100) + ",00"));
    assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
    await act(async () => window.document.querySelector('button[aria-label="Chiudi acquisto"]').click());
    assert.equal(window.document.activeElement, card, "Closing returns keyboard focus to the selected price card");
  });
}

test("sold-out inline cards are disabled independently and never open a purchase or request a quote", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 20, mc: 0, dinner: 10 } }, "it", undefined, { presentation: "packages" });
  for (const id of ["bundle", "only-mc"]) {
    const card = window.document.querySelector(`[data-event-package-price="${id}"]`);
    assert.equal(card.disabled, true);
    await act(async () => card.click());
  }
  assert.equal(window.document.querySelector("dialog").open, false);
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/quote" || call.url === "/api/commerce/checkout"), false);
  const availableCard = window.document.querySelector('[data-event-package-price="only-ws"]');
  assert.equal(availableCard.disabled, false);
  await act(async () => availableCard.click()); await ui.settleQuote();
  assert.equal(window.document.querySelector('input[name="package-0"]:checked').value, "only-ws");
});

test("globally unavailable or exhausted events disable every price card while keeping the separate waitlist action", async (context) => {
  const ui = await setup(context, { ...catalog, available: false }, "it", undefined, { presentation: "packages" });
  const cards = [...window.document.querySelectorAll("[data-event-package-price]")];
  assert.equal(cards.length, 3);
  assert.ok(cards.every((card) => card.disabled));
  for (const card of cards) await act(async () => card.click());
  assert.equal(window.document.querySelector("dialog").open, false);
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/quote"), false);
  await ui.open();
  assert.match(window.document.querySelector("dialog h2").textContent, /prossimo posto/);
});

test("price-card changes preserve contact and group data, remove included add-ons and reset only the changed participant menus", async (context) => {
  const withUpgradeAddon = structuredClone(catalog);
  withUpgradeAddon.config.addons.push({ id: "add-mc", name: "Aggiungi masterclass", activityId: "mc", amountCents: 4000 });
  const ui = await setup(context, withUpgradeAddon, "it", undefined, { presentation: "packages" });
  const selectCard = async (id) => act(async () => window.document.querySelector(`[data-event-package-price="${id}"]`).click());
  const close = async () => act(async () => window.document.querySelector('button[aria-label="Chiudi acquisto"]').click());
  await selectCard("only-ws");
  await ui.change(window.document.querySelector('select[aria-label="Numero di partecipanti"]'), "2");
  await ui.fillPerson(0); await ui.fillPerson(1);
  await act(async () => window.document.querySelector('input[name="addon-0-add-mc"]').click());
  await act(async () => window.document.querySelector('input[name="addon-0-add-dinner"]').click());
  await ui.change(window.document.querySelectorAll("fieldset")[0].querySelector('select[aria-label^="Cena:"]'), "Vegetariano");
  await act(async () => window.document.querySelector('input[name="package-1"][value="only-mc"]').click());
  await act(async () => window.document.querySelector('input[name="addon-1-add-dinner"]').click());
  await ui.change(window.document.querySelectorAll("fieldset")[1].querySelector('select[aria-label^="Cena:"]'), "Classico");
  await ui.settleQuote(); await close();
  await selectCard("only-ws"); await ui.settleQuote();
  assert.equal(window.document.querySelectorAll("fieldset")[0].querySelector('select[aria-label^="Cena:"]').value, "Vegetariano", "Reopening the same formula retains entered choices");
  await close(); await selectCard("bundle"); await ui.settleQuote();
  assert.equal(window.document.querySelectorAll("fieldset").length, 2);
  for (const [index, firstName, email] of [[0, "Matias", "matias@example.test"], [1, "Anna", "anna@example.test"]]) {
    assert.equal(window.document.querySelector(`input[name="firstName-${index}"]`).value, firstName);
    assert.equal(window.document.querySelector(`input[name="participant-${index}-email"]`).value, email);
    assert.equal(window.document.querySelector(`input[name="participant-${index}-phone"]`).value, "+393331234567");
    assert.equal(window.document.querySelector(`input[name="participant-${index}-document-number"]`).value, "RSSMRA85T10A562S");
  }
  const quoted = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body.participants;
  assert.equal(quoted[0].packageId, "bundle");
  assert.deepEqual(quoted[0].addonIds, ["add-dinner"], "The newly included masterclass is no longer charged as an add-on");
  assert.deepEqual(quoted[0].menuChoices, {});
  assert.equal(quoted[1].packageId, "only-mc");
  assert.deepEqual(quoted[1].addonIds, ["add-dinner"]);
  assert.deepEqual(quoted[1].menuChoices, { dinner: "Classico" });
  await close(); await ui.open(); await ui.settleQuote();
  assert.equal(window.document.querySelector('input[name="package-0"]:checked').value, "bundle", "The generic purchase button keeps the existing selection");
  assert.equal(window.document.querySelector('input[name="participant-0-email"]').value, "matias@example.test");
  await close();
  assert.equal(window.document.activeElement, window.document.querySelector(".packagePurchaseAction button"), "The generic purchase button regains focus after a card was used previously");
});

test("inline sold-out prices offer a separate waitlist rather than a payment action", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 0, mc: 0, dinner: 0 } }, "it", undefined, { presentation: "packages" });
  const presentation = window.document.querySelector("[data-commerce-package-presentation]");
  assert.equal(presentation.querySelectorAll("[data-event-package-price]").length, 3);
  assert.match(presentation.querySelector(".packagePurchaseAction button").textContent, /lista d’attesa/);
  await ui.open(); await ui.settleQuote();
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/quote" || call.url === "/api/commerce/checkout"), false);
  assert.match(window.document.querySelector("dialog h2").textContent, /prossimo posto/);
});

test("inline closed sales disable purchase and suppress prices after their activities close", async (context) => {
  const closed = structuredClone(catalog); closed.available = false; closed.event.date = "2000-01-01T08:00:00Z";
  closed.config.activities.forEach((activity) => { activity.startsAt = "2000-01-01T08:00:00Z"; });
  const ui = await setup(context, closed, "it", undefined, { presentation: "packages" });
  const presentation = window.document.querySelector("[data-commerce-package-presentation]");
  assert.equal(presentation.querySelector("[data-event-price-summary]"), null);
  assert.equal(presentation.querySelector("button").disabled, true);
  assert.equal(presentation.querySelector("button").textContent, "Vendite chiuse");
  await ui.open();
  assert.equal(window.document.querySelector("dialog").open, false);
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/quote" || call.url === "/api/commerce/checkout"), false);
});

test("inline zero-price offers remain purchasable and quote zero without falling through to legacy checkout", async (context) => {
  const free = structuredClone(catalog); free.config.packages = [free.config.packages[0]]; free.config.packages[0].prices[0].amountCents = 0;
  const ui = await setup(context, free, "it", undefined, { presentation: "packages" });
  const presentation = window.document.querySelector("[data-commerce-package-presentation]");
  assert.match(presentation.querySelector("[data-event-package-price]").textContent, /Gratis/);
  assert.equal(presentation.querySelector("button").disabled, false);
  ui.setQuoteResponse(() => ({ ok: true, json: async () => ({ quote: { totalCents: 0, lines: [] } }) }));
  await ui.open(); await ui.settleQuote();
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, false);
  assert.match(window.document.querySelector("form").textContent, /Totale0,00/);
  assert.equal(ui.calls.some((call) => call.url === "/api/commerce/checkout"), false);
});

test("ended inline events retain their fallback without loading a purchase catalog", async (context) => {
  const ui = await setup(context, catalog, "it", undefined, { presentation: "packages", ended: true });
  assert.equal(window.document.querySelector("button").textContent, "Legacy checkout");
  assert.equal(ui.calls.length, 0);
});

test("group purchase keeps independent formulas, optional dinner and menus for each person", async (context) => {
  const ui = await setup(context);
  await ui.open();
  assert.equal(window.document.querySelector("dialog").open, true);
  assert.equal(window.document.body.style.overflow, "hidden");
  await act(async () => window.document.querySelector('input[value="only-ws"]').click());
  await ui.change(window.document.querySelector('select[aria-label="Numero di partecipanti"]'), "2");
  assert.equal(window.document.querySelectorAll("fieldset").length, 2);
  const second = window.document.querySelectorAll("fieldset")[1];
  await act(async () => second.querySelector('input[value="bundle"]').click());
  await act(async () => second.querySelector('input[name="addon-1-add-dinner"]').click());
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
  await act(async () => second.querySelector('input[name="addon-1-add-dinner"]').click());
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
  await act(async () => window.document.querySelector('input[value="only-ws"]').click());
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

test("a discounted Masterclass opens Meraki's Stripe domain with the accepted 30-euro total", async (context) => {
  const screenshotCatalog = structuredClone(catalog);
  screenshotCatalog.config.packages.find((offer) => offer.id === "only-mc").prices = [{ ...tier("early", 3500), label: "Early Bird" }];
  const ui = await setup(context, screenshotCatalog, "it", undefined, { captureNavigation: true });
  ui.setQuoteResponse((body) => {
    const discounted = body.discountCode === "ILPRESIDENTE";
    return { ok: true, json: async () => ({ quote: { subtotalCents: 3500, discountCents: discounted ? 500 : 0, totalCents: discounted ? 3000 : 3500,
      discount: discounted ? { code: "ILPRESIDENTE", targetType: "activity", targetIds: ["mc"] } : null,
      lines: [{ label: "Masterclass · Early Bird", packageId: "only-mc", tierId: "early", quantity: 1, unitAmountCents: discounted ? 3000 : 3500, subtotalCents: 3500, totalCents: discounted ? 3000 : 3500, kind: "package" }] } }) };
  });
  await ui.open();
  await act(async () => window.document.querySelector('input[value="only-mc"]').click());
  await ui.fillPerson(); await ui.settleQuote();
  await ui.change(window.document.querySelector('input[name="discountCode"]'), "ILPRESIDENTE");
  await act(async () => [...window.document.querySelectorAll("button")].find((button) => button.textContent === "Applica").click());
  await ui.settleQuote();
  assert.match(window.document.querySelector("form").textContent, /Subtotale35,00/);
  assert.match(window.document.querySelector("form").textContent, /Sconto.*ILPRESIDENTE.*5,00/);
  assert.match(window.document.querySelector("form").textContent, /Totale30,00/);
  const stripeUrl = "https://pay.merakiexperience.org/c/pay/cs_live_placeholder#fidkdWxOYHwnPyd1blpxYHZxWjA0";
  ui.setCheckoutResponse({ url: stripeUrl }, { ok: true });
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const requests = ui.calls.filter((call) => call.url === "/api/commerce/checkout");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.expectedTotalCents, 3000);
  assert.equal(requests[0].body.discountCode, "ILPRESIDENTE");
  assert.equal(requests[0].body.participants[0].packageId, "only-mc");
  assert.deepEqual(ui.redirects, [stripeUrl]);
  assert.equal(window.document.querySelector('[role="alert"]'), null);
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
  const toggles = [...window.document.querySelectorAll('input[name$="-marketing-consent"]')];
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
  assert.equal(window.document.querySelector('input[value="only-ws"]').checked, true, "An existing ticket keeps its purchased package even when the combo is listed first");
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
  await ui.open(); await act(async () => window.document.querySelector('input[value="only-ws"]').click()); await ui.fillPerson(); await ui.settleQuote();
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
  const ui = await setup(context); await ui.open(); await act(async () => window.document.querySelector('input[value="only-ws"]').click()); await ui.settleQuote();
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
  await act(async () => window.document.querySelector('input[name="addon-0-add-dinner"]').click());
  const menu = [...window.document.querySelectorAll("select")].find((element) => [...element.options].some((option) => option.textContent === "Vegetarian"));
  assert.ok(menu); await ui.change(menu, "Vegetariano"); await ui.settleQuote();
  const latest = ui.calls.filter((call) => call.url === "/api/commerce/quote").at(-1).body;
  assert.equal(latest.locale, "en"); assert.equal(latest.participants[0].menuChoices.dinner, "Vegetariano");
  assert.match(ui.calls.find((call) => call.url.startsWith("/api/commerce/catalog")).url, /locale=en/);
});

for (const locale of ["en", "es"]) test(`${locale} localizes sale deadline month names while keeping Italian 24-hour Rome time`, async (context) => {
  const dated = structuredClone(catalog);
  dated.config.packages[0].prices[0].endsAt = "2099-05-01T22:30:00Z";
  dated.config.activities[2].salesEnd = "2099-05-01T22:30:00Z";
  const ui = await setup(context, dated, locale); await ui.open();
  const text = window.document.querySelector("form").textContent;
  assert.match(text, locale === "es" ? /hasta el 02\/05\/2099, 00:30/ : /until 02\/05\/2099, 00:30/);
  assert.match(text, locale === "es" ? /Reserva antes del 2 may, 00:30/ : /Book by 2 May, 00:30/);
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


test("changing a formula moves it first, keeps keyboard focus on its original radio and preserves contact/group data", async (context) => {
  const ui = await setup(context); await ui.open();
  await ui.change(window.document.querySelector('select[aria-label="Numero di partecipanti"]'), "2");
  await ui.fillPerson(0); await ui.fillPerson(1);
  const secondRadio = window.document.querySelector('input[name="package-1"][value="only-mc"]');
  await act(async () => { secondRadio.focus(); secondRadio.click(); });
  assert.equal(window.document.activeElement, secondRadio);
  for (const id of ["only-ws", "only-mc", "bundle", "only-ws"]) {
    const radio = window.document.querySelector(`input[name="package-0"][value="${id}"]`);
    await act(async () => { radio.focus(); radio.click(); });
    const ordered = [...window.document.querySelectorAll('input[name="package-0"]')];
    assert.equal(ordered[0], radio, "React preserves the focused keyed control while changing order");
    assert.equal(window.document.activeElement, radio, "Selection never drops keyboard focus to the document body");
    assert.equal(radio.checked, true);
    assert.ok(radio.closest("label").classList.contains("selectedPackageOption"));
    assert.ok(ordered.slice(1).every((input) => !input.checked && input.closest("label").classList.contains("unselectedPackageOption")));
    assert.equal(window.document.querySelector('input[name="package-1"]:checked').value, "only-mc");
    assert.equal(window.document.querySelector('input[name="participant-0-email"]').value, "matias@example.test");
    assert.equal(window.document.querySelector('input[name="participant-1-email"]').value, "anna@example.test");
  }
});

const affiliateId = "00000000-0000-4000-8000-000000000501";
for (const locale of ["it", "en", "de", "es"]) test(`${locale} shows event affiliates once per purchase and sends the choice only to checkout`, async (context) => {
  const ui = await setup(context, { ...catalog, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] }, locale);
  await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  const affiliate = window.document.querySelector('select[name="affiliateId"]');
  const copy = checkoutCopy.checkoutCopy(locale);
  assert.equal(affiliate.required, false);
  assert.equal(affiliate.getAttribute("aria-label"), copy.affiliateLabel);
  assert.equal(affiliate.value, "");
  assert.equal(affiliate.options[0].textContent, copy.directPurchase);
  assert.equal(affiliate.options[1].textContent, "Scuola Meraki");
  await ui.change(affiliate, affiliateId);
  await ui.change(window.document.querySelector('select[aria-label="' + copy.quantityLabel + '"]'), "2");
  await ui.fillPerson(1); await ui.settleQuote();
  assert.equal(window.document.querySelectorAll('select[name="affiliateId"]').length, 1, "An affiliate belongs to the order, not each attendee");
  assert.equal(affiliate.value, affiliateId);
  assert.ok(ui.calls.filter((call) => call.url === "/api/commerce/quote").every((call) => !("affiliateId" in call.body)), "Affiliation does not affect authoritative pricing");
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const request = ui.calls.find((call) => call.url === "/api/commerce/checkout").body;
  assert.equal(request.affiliateId, affiliateId);
  assert.equal(request.attendees.length, 2);
  assert.ok(request.attendees.every((person) => person.marketingConsent === false));
});

test("direct purchases remain possible with affiliates and omit any attribution", async (context) => {
  const ui = await setup(context, { ...catalog, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] });
  await ui.open(); await ui.fillPerson(); await ui.settleQuote();
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal("affiliateId" in ui.calls.find((call) => call.url === "/api/commerce/checkout").body, false);
});

for (const affiliates of [undefined, []]) test(`no affiliate field exists for an event with ${affiliates ? "an empty list" : "no affiliate configuration"}`, async (context) => {
  const ui = await setup(context, { ...catalog, affiliates }); await ui.open();
  assert.equal(window.document.querySelector('[name="affiliateId"]'), null);
});

test("upgrades never offer affiliate reassignment even when affiliates are active", async (context) => {
  const upgrade = { passId: "00000000-0000-4000-8000-000000000002", token: "private-pass-token", firstName: "Matias", lastName: "Lisio", packageId: "only-ws", activityIds: ["ws"], contact: { email: "original@example.test" } };
  const ui = await setup(context, { ...catalog, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] }, "it", upgrade);
  await ui.open();
  assert.equal(window.document.querySelector('[name="affiliateId"]'), null);
  await act(async () => window.document.querySelector('input[value="bundle"]').click()); await ui.settleQuote();
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal("affiliateId" in ui.calls.find((call) => call.url === "/api/commerce/checkout").body, false);
});

test("waitlists do not ask for an affiliate or send a purchase attribution", async (context) => {
  const ui = await setup(context, { ...catalog, available: false, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] }); await ui.open();
  assert.equal(window.document.querySelector('[name="affiliateId"]'), null);
});


test("arrow keys reach every formula despite selection-first reordering and retain focus", async (context) => {
  const ui = await setup(context); await ui.open();
  const selected = () => window.document.querySelector('input[name="package-0"]:checked');
  selected().focus();
  for (const [key, expected] of [["ArrowDown", "only-ws"], ["ArrowDown", "only-mc"], ["ArrowDown", "bundle"], ["ArrowUp", "only-mc"], ["Home", "bundle"], ["End", "only-mc"]]) {
    await act(async () => selected().dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
    assert.equal(selected().value, expected);
    assert.equal(window.document.activeElement, selected());
    assert.equal(window.document.querySelector('input[name="package-0"]'), selected());
  }
});

test("arrow navigation skips unavailable formulas while preserving the selected option", async (context) => {
  const ui = await setup(context, { ...catalog, availability: { ws: 20, mc: 0, dinner: 10 } }); await ui.open();
  const selected = window.document.querySelector('input[name="package-0"]:checked'); selected.focus();
  await act(async () => selected.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  assert.equal(window.document.activeElement, selected);
  assert.equal(selected.value, "only-ws"); assert.equal(selected.checked, true);
});


for (const locale of ["it", "en", "de", "es"]) test(`${locale} unavailable affiliate explains how to recover without losing participant details`, async (context) => {
  const ui = await setup(context, { ...catalog, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] }, locale);
  await ui.open(); await ui.fillPerson();
  await ui.change(window.document.querySelector('select[name="affiliateId"]'), affiliateId);
  await ui.settleQuote();
  ui.setCheckoutResponse({ code: "affiliate_unavailable", error: "Affiliato non valido" });
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(window.document.querySelector('[role="alert"]').textContent, checkoutCopy.checkoutCopy(locale).affiliateUnavailable);
  assert.equal(window.document.querySelector("dialog").open, true);
  assert.equal(window.document.querySelector('input[name="participant-0-email"]').value, "matias@example.test");
  await ui.change(window.document.querySelector('select[name="affiliateId"]'), "");
  await ui.settleQuote();
  ui.setCheckoutResponse({ error: "Pagamento non disponibile" });
  await act(async () => window.document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const retry = ui.calls.filter((call) => call.url === "/api/commerce/checkout").at(-1).body;
  assert.equal("affiliateId" in retry, false);
  assert.equal(retry.attendees[0].email, "matias@example.test");
});

for (const locale of ["it", "en", "de", "es"]) test(`${locale} sold-out quotes show the specific localized reason instead of an Italian API message`, async (context) => {
  const ui = await setup(context, catalog, locale);
  ui.setQuoteResponse(() => ({ ok: false, json: async () => ({ code: "sold_out", error: "MESSAGGIO SERVER ITALIANO" }) }));
  await ui.open(); await ui.settleQuote();
  assert.equal(window.document.querySelector('[role="alert"]').textContent, checkoutCopy.checkoutFailureCopy("sold_out", locale));
  assert.equal(window.document.querySelector('button[type="submit"]').disabled, true);
  assert.ok(ui.calls.filter((call) => call.url === "/api/commerce/quote").every((call) => call.body.locale === locale));
  assert.ok(!window.document.body.textContent.includes("MESSAGGIO SERVER ITALIANO"));
});
