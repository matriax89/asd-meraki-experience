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
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://meraki.test/it/eventi/test-event",
  pretendToBeVisual: true,
});
const { window } = dom;
const globalDescriptors = new Map();
for (const [key, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

// jsdom has the dialog element but does not implement these native primitives.
// Keep the real dialog, React close/cancel handlers and DOM focus behavior.
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
  this.querySelector("button, input, [tabindex]")?.focus();
};
window.HTMLDialogElement.prototype.close = function () {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new window.Event("close"));
};
const { createRoot } = await import("react-dom/client");

after(() => {
  dom.window.close();
  for (const [key, descriptor] of globalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const eventId = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const source = readFileSync(new URL("../src/app/[locale]/(public)/eventi/[slug]/checkout-button.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function compileDependency(path, modules = {}) {
  const dependencySource = readFileSync(new URL(path, import.meta.url), "utf8");
  const dependencyCompiled = ts.transpileModule(dependencySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(dependencyCompiled, { exports, window, document: window.document, HTMLElement: window.HTMLElement, URL, require: (name) => modules[name] || nativeFormControlMocks[name] || require(name) });
  return exports;
}
const checkoutCopy = compileDependency("../src/components/meraki/checkout-copy.ts");
const cssModule = { default: new Proxy({}, { get: (_, key) => key }) };
const attendeeModel = compileDependency("../src/lib/commerce/attendee.ts");
const phoneCountry = compileDependency("../src/lib/commerce/phone-country.ts");
const contactFields = compileDependency("../src/components/meraki/checkout-contact-fields.tsx", { "./checkout-copy": checkoutCopy, "./commerce-purchase.module.css": cssModule, "@/lib/commerce/phone-country": phoneCountry });
const discountCopyModule = compileDependency("../src/components/meraki/discount-copy.ts");
const dependencies = {
  "@/components/meraki/discount-copy": discountCopyModule,
  "@/components/meraki/discount-code-fields": compileDependency("../src/components/meraki/discount-code-fields.tsx", { "./discount-copy": discountCopyModule, "./commerce-purchase.module.css": cssModule }),
  "@/lib/commerce/attendee": attendeeModel,
  "@/components/meraki/checkout-contact-fields": contactFields,
  "@/components/meraki/checkout-copy": checkoutCopy,
  "@/components/meraki/commerce-public-model": compileDependency("../src/components/meraki/commerce-public-model.ts"),
  "@/components/meraki/use-checkout-viewport": compileDependency("../src/components/meraki/use-checkout-viewport.ts"),
  "@/components/meraki/commerce-purchase.module.css": cssModule,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function setup(context, { overflow = "auto", locale = "it", affiliates } = {}) {
  window.document.body.innerHTML = '<div id="checkout-root"></div>';
  window.document.body.style.overflow = overflow;
  const calls = [];
  const quoteCalls = [];
  const assignedUrls = [];
  let quoteResponse = () => Promise.resolve({ ok: true, json: async () => ({ quote: { totalCents: 3000 } }) });
  let uuidCalls = 0;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window: new Proxy(window, { get(target, key) {
      return key === "location" ? { origin: target.location.origin, assign: url => assignedUrls.push(url) } : Reflect.get(target, key, target);
    } }),
    document: window.document,
    FormData: window.FormData,
    URL,
    Error,
    AbortController,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, "0")}` },
    fetch: (url, options) => {
      if (url === "/api/checkout/ticket/quote") {
        quoteCalls.push({ url, options, body: JSON.parse(options.body) });
        return quoteResponse(JSON.parse(options.body));
      }
      const pending = deferred();
      calls.push({ ...pending, url, options, body: JSON.parse(options.body) });
      return pending.promise;
    },
    require: (name) => name === "next-intl" ? { useLocale: () => locale } : dependencies[name] || nativeFormControlMocks[name] || require(name),
  });
  const root = createRoot(window.document.getElementById("checkout-root"));
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await act(async () => root.unmount());
  };
  context.after(dispose);
  await act(async () => root.render(React.createElement(exports.CheckoutButton, { eventId, affiliates })));
  const dialog = window.document.querySelector("dialog");
  const trigger = window.document.querySelector('button[type="button"]');
  const form = dialog.querySelector("form");
  const submitButton = form.querySelector('button[type="submit"]');
  const closeButton = dialog.querySelector('button[aria-label="Chiudi acquisto"]');
  const change = async (element, value) => act(async () => { const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value); element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  const fill = async () => {
    form.elements.namedItem("nome").value = "  Matias ";
    form.elements.namedItem("cognome").value = " Lisio  ";
    await change(form.elements.namedItem("email"), "buyer@example.test");
    await change(form.elements.namedItem("buyer-phone"), "+393331234567");
    await change(form.elements.namedItem("buyer-document-number"), locale === "it" ? "RSSMRA85T10A562S" : "ABC123456");
  };
  const open = async () => {
    trigger.focus();
    await act(async () => trigger.click());
  };
  const submit = async () => act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  const respond = async (data, { ok = false } = {}) => {
    await act(async () => calls.at(-1).resolve({ ok, json: async () => data }));
  };
  const fail = async (message = "Connessione interrotta") => {
    await act(async () => calls.at(-1).reject(new Error(message)));
  };
  const escape = async () => {
    const cancel = new window.Event("cancel", { cancelable: true });
    await act(async () => {
      if (dialog.dispatchEvent(cancel)) dialog.close();
    });
    return cancel;
  };
  return { dialog, trigger, form, submitButton, closeButton, calls, quoteCalls, assignedUrls, setQuoteResponse: (value) => { quoteResponse = value; }, change, fill, open, submit, respond, fail, escape, dispose };
}

test("purchase opens an accessible native dialog and preserves required/email validation", async (context) => {
  const checkout = await setup(context);
  assert.equal(checkout.dialog.open, false);
  await checkout.open();
  assert.equal(checkout.dialog.open, true);
  const title = window.document.getElementById(checkout.dialog.getAttribute("aria-labelledby"));
  assert.equal(title?.textContent, "Ci sei quasi.");
  assert.equal(window.document.body.style.overflow, "hidden");
  assert.equal(checkout.dialog.contains(window.document.activeElement), true);

  const inputs = [...checkout.form.querySelectorAll("input")];
  assert.deepEqual(inputs.map((input) => input.name), ["nome", "cognome", "email", "buyer-phone", "buyer-document-number", "buyer-marketing-consent", "discountCode"]);
  assert.deepEqual(inputs.filter((input) => input.required).map((input) => input.name), ["nome", "cognome", "email", "buyer-phone"]);
  assert.equal(checkout.form.elements.namedItem("buyer-document-number").required, false);
  assert.equal(inputs.find((input) => input.type === "checkbox").checked, false);
  assert.equal(inputs.find((input) => input.type === "checkbox").required, false);
  assert.equal(inputs.at(-1).required, false);
  assert.equal(inputs[2].type, "email");
  assert.equal(inputs[2].autocomplete, "email");
  await act(async () => checkout.submitButton.click());
  assert.equal(checkout.calls.length, 0, "Empty required fields must not contact Stripe");
  await checkout.fill();
  inputs[2].value = "invalid-address";
  await act(async () => checkout.submitButton.click());
  assert.equal(checkout.calls.length, 0, "An invalid email must not contact Stripe");
  inputs[2].value = "buyer@example.test";
  assert.equal(checkout.form.checkValidity(), true);
});

test("pending checkout sends one trimmed request and blocks duplicate submissions and dismissal", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  await act(async () => {
    checkout.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    checkout.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(checkout.calls.length, 1);
  assert.equal(checkout.calls[0].url, "/api/checkout/ticket");
  assert.equal(checkout.calls[0].options.method, "POST");
  assert.deepEqual(checkout.calls[0].body, {
    eventId,
    buyerEmail: "buyer@example.test",
    buyerNome: "Matias",
    buyerCognome: "Lisio",
    attendee: { firstName: "Matias", lastName: "Lisio", email: "buyer@example.test", phone: "+393331234567", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "RSSMRA85T10A562S", marketingConsent: false },
    locale: "it",
    expectedTotalCents: 3000,
    checkoutAttemptId: "00000000-0000-4000-8000-000000000001",
  });
  assert.ok([...checkout.form.querySelectorAll("input, select, button")].every((element) => element.disabled));
  assert.equal(checkout.closeButton.disabled, true);
  assert.match(checkout.submitButton.textContent, /Apertura pagamento/);
  const cancel = await checkout.escape();
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(checkout.dialog.open, true);
  assert.equal(window.document.body.style.overflow, "hidden");
  await checkout.fail();
});

test("API rejection keeps the purchase open, shows the error and enables a corrected retry", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  await checkout.submit();
  await checkout.respond({ error: "I posti disponibili sono terminati." });
  assert.equal(checkout.dialog.open, true);
  assert.equal(window.document.body.style.overflow, "hidden");
  assert.equal(checkout.dialog.querySelector('[role="alert"]').textContent, "I posti disponibili sono terminati.");
  assert.ok([...checkout.form.querySelectorAll("input, button")].filter((element) => element.textContent !== "Applica").every((element) => !element.disabled));
  assert.equal(checkout.closeButton.disabled, false);
  assert.equal(checkout.form.elements.namedItem("email").value, "buyer@example.test");
  await checkout.submit();
  assert.equal(checkout.dialog.querySelector('[role="alert"]'), null);
  assert.equal(checkout.calls.length, 2);
  await checkout.fail();
});

test("ambiguous failures preserve the purchase attempt and confirmed expiry starts a fresh attempt", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  await checkout.submit();
  const originalAttempt = checkout.calls[0].body.checkoutAttemptId;
  await checkout.fail("Connessione interrotta");
  await checkout.submit();
  assert.equal(checkout.calls[1].body.checkoutAttemptId, originalAttempt);
  await checkout.respond({ error: "Riprova tra poco." });
  await checkout.submit();
  assert.equal(checkout.calls[2].body.checkoutAttemptId, originalAttempt);
  await checkout.respond({ code: "request_expired", error: "Prenotazione scaduta. Riprova." });
  await checkout.submit();
  assert.notEqual(checkout.calls[3].body.checkoutAttemptId, originalAttempt);
  assert.equal(checkout.calls[3].body.checkoutAttemptId, "00000000-0000-4000-8000-000000000002");
  await checkout.fail();
});

test("native Escape and close restore body scrolling and focus to the purchase trigger", async (context) => {
  const checkout = await setup(context, { overflow: "scroll" });
  await checkout.open();
  const cancel = await checkout.escape();
  assert.equal(cancel.defaultPrevented, false);
  assert.equal(checkout.dialog.open, false);
  assert.equal(window.document.body.style.overflow, "scroll");
  assert.equal(window.document.activeElement, checkout.trigger);
  await checkout.open();
  assert.equal(window.document.body.style.overflow, "hidden");
  await act(async () => checkout.closeButton.click());
  assert.equal(checkout.dialog.open, false);
  assert.equal(window.document.body.style.overflow, "scroll");
  assert.equal(window.document.activeElement, checkout.trigger);
});

test("unmounting an open purchase restores the original page scroll setting", async (context) => {
  const checkout = await setup(context, { overflow: "clip" });
  await checkout.open();
  assert.equal(window.document.body.style.overflow, "hidden");
  await checkout.dispose();
  assert.equal(window.document.body.style.overflow, "clip");
});

test("an untrusted checkout redirect is rejected without leaving the purchase dialog", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  await checkout.submit();
  await checkout.respond({ url: "https://checkout.stripe.com.attacker.test/session" }, { ok: true });
  assert.equal(checkout.dialog.open, true);
  assert.match(checkout.dialog.querySelector('[role="alert"]').textContent, /collegamento al pagamento non è valido/);
  assert.equal(checkout.submitButton.disabled, false);
  assert.equal(window.location.href, "https://meraki.test/it/eventi/test-event");
  assert.equal(checkout.assignedUrls.length, 0);
});

test("a guest purchase opens Meraki's Stripe custom domain without losing its Checkout fragment", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  await checkout.submit();
  const paymentUrl = "https://pay.merakiexperience.org/c/pay/cs_test_placeholder#fidnandhYHdWcXxpYCc";
  await checkout.respond({ url: paymentUrl }, { ok: true });
  assert.deepEqual(checkout.assignedUrls, [paymentUrl]);
  assert.equal(checkout.dialog.querySelector('[role="alert"]'), null);
  assert.equal(checkout.calls[0].body.expectedTotalCents, 3000);
});


test("guest contact fields focus an invalid provided tax code, while clearing it allows payment", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  const documentInput = checkout.form.elements.namedItem("buyer-document-number");
  await checkout.change(documentInput, "RSSMRA85T10A562A");
  await checkout.submit();
  assert.equal(checkout.calls.length, 0);
  assert.equal(window.document.activeElement, documentInput);
  assert.equal(documentInput.getAttribute("aria-invalid"), "true");
  const error = window.document.getElementById("buyer-documentNumber-error");
  assert.equal(error?.textContent, checkoutCopy.checkoutCopy("it").invalidFiscalCode);
  assert.ok(documentInput.getAttribute("aria-describedby").split(" ").includes(error.id));
  await checkout.change(documentInput, "");
  assert.equal(checkout.form.reportValidity(), true);
  await checkout.submit();
  assert.equal(checkout.calls.length, 1);
  assert.equal(checkout.calls[0].body.attendee.documentNumber, "");
  assert.equal(checkout.calls[0].body.attendee.documentCountry, "");
  await checkout.fail();
});

for (const locale of ["it", "en", "de", "es"]) {
  for (const documentType of ["codice_fiscale", "foreign_id"]) test(`${locale} legacy checkout accepts a blank ${documentType} without requiring a document country`, async (context) => {
    const checkout = await setup(context, { locale });
    await checkout.open(); await checkout.fill();
    await checkout.change(checkout.form.elements.namedItem("buyer-document-type"), documentType);
    await checkout.change(checkout.form.elements.namedItem("buyer-document-number"), "");
    if (documentType === "foreign_id") {
      const country = checkout.form.elements.namedItem("buyer-document-country");
      await checkout.change(country, "");
      assert.equal(country.required, false);
    }
    assert.equal(checkout.form.reportValidity(), true, "An omitted optional document must not block native validation");
    await act(async () => checkout.submitButton.click());
    assert.equal(checkout.calls.length, 1);
    assert.equal(checkout.calls[0].body.locale, locale);
    assert.deepEqual(checkout.calls[0].body.attendee, {
      firstName: "Matias", lastName: "Lisio", email: "buyer@example.test", phone: "+393331234567",
      documentType, documentCountry: "", documentNumber: "", marketingConsent: false,
    });
    await checkout.fail();
  });

  test(`${locale} legacy checkout identifies an incomplete phone and accepts a corrected phone without a document`, async (context) => {
    const checkout = await setup(context, { locale });
    await checkout.open(); await checkout.fill();
    const phone = checkout.form.elements.namedItem("buyer-phone");
    await checkout.change(checkout.form.elements.namedItem("buyer-document-number"), "");
    await checkout.change(phone, "123");
    assert.equal(checkout.form.checkValidity(), true, "The domain check must explain an incomplete phone");
    await act(async () => checkout.submitButton.click());
    assert.equal(checkout.calls.length, 0);
    assert.equal(window.document.activeElement, phone);
    assert.equal(phone.getAttribute("aria-invalid"), "true");
    const error = window.document.getElementById("buyer-phone-error");
    assert.equal(error?.textContent, checkoutCopy.checkoutCopy(locale).invalidPhone);
    assert.ok(phone.getAttribute("aria-describedby").split(" ").includes(error.id));
    assert.equal(phone.value, "+39123", "The selected country supplies the prefix while the number remains incomplete");
    await checkout.change(phone, "+39 333 1234567");
    await act(async () => checkout.submitButton.click());
    assert.equal(checkout.calls.length, 1);
    assert.equal(checkout.calls[0].body.attendee.phone, "+393331234567");
    assert.equal(checkout.calls[0].body.attendee.documentNumber, "");
    assert.equal(checkout.calls[0].body.attendee.documentCountry, "");
    await checkout.fail();
  });
}


for (const [locale, country, national, international] of [
  ["it", "IT", "3331234567", "+393331234567"],
  ["en", "GB", "07700900123", "+447700900123"],
  ["de", "DE", "015112345678", "+4915112345678"],
  ["es", "ES", "612345678", "+34612345678"],
]) test(`${locale} legacy checkout submits a national phone with the chosen country prefix`, async (context) => {
  const checkout = await setup(context, { locale });
  await checkout.open();
  const countryInput = checkout.form.elements.namedItem("buyer-phone-country");
  assert.equal(countryInput.value, country);
  await checkout.fill();
  await checkout.change(checkout.form.elements.namedItem("buyer-document-number"), "");
  await checkout.change(countryInput, country);
  const phone = checkout.form.elements.namedItem("buyer-phone");
  await checkout.change(phone, national);
  assert.equal(phone.value, international);
  assert.equal(countryInput.value, country);
  assert.equal(checkout.form.reportValidity(), true);
  await act(async () => checkout.submitButton.click());
  assert.equal(checkout.calls.length, 1);
  assert.equal(checkout.calls[0].body.attendee.phone, international);
  assert.deepEqual(Object.keys(checkout.calls[0].body.attendee).sort(), ["documentCountry", "documentNumber", "documentType", "email", "firstName", "lastName", "marketingConsent", "phone"]);
  assert.equal(checkout.calls[0].body.attendee.documentNumber, "");
  await checkout.fail();
});

test("simple tickets apply a verified code before payment and require the quoted net amount", async (context) => {
  const checkout = await setup(context); await checkout.open(); await checkout.fill();
  checkout.setQuoteResponse((body) => Promise.resolve({ ok: true, json: async () => ({ quote: { subtotalCents: 3000, discountCents: 500, totalCents: 2500, discount: { code: body.discountCode } } }) }));
  await checkout.change(checkout.form.querySelector('input[name="discountCode"]'), " save5 ");
  await act(async () => [...checkout.form.querySelectorAll("button")].find((button) => button.textContent === "Applica").click());
  assert.equal(checkout.quoteCalls.at(-1).body.discountCode, "SAVE5");
  assert.match(checkout.form.textContent, /Sconto.*SAVE5.*5,00/);
  await checkout.submit();
  assert.equal(checkout.calls.at(-1).body.discountCode, "SAVE5");
  assert.equal(checkout.calls.at(-1).body.expectedTotalCents, 2500);
  checkout.setQuoteResponse(() => Promise.resolve({ ok: true, json: async () => ({ quote: { totalCents: 2600, subtotalCents: 3100, discountCents: 500, discount: { code: "SAVE5" } } }) }));
  await checkout.respond({ code: "price_changed", quote: { totalCents: 2600, subtotalCents: 3100, discountCents: 500, discount: { code: "SAVE5" } } });
  assert.match(checkout.form.textContent, /26,00/);
  assert.equal(checkout.calls.length, 1);
  const oldAttempt = checkout.calls[0].body.checkoutAttemptId;
  await checkout.submit();
  assert.equal(checkout.calls[1].body.expectedTotalCents, 2600);
  assert.notEqual(checkout.calls[1].body.checkoutAttemptId, oldAttempt);
  await checkout.fail();
});


test("reopening an ambiguous discounted simple checkout reuses the held quote and exact attempt", async (context) => {
  const checkout = await setup(context); await checkout.open(); await checkout.fill();
  let held = false;
  checkout.setQuoteResponse(() => Promise.resolve(held ? { ok: false, status: 409, json: async () => ({ code: "discount_exhausted" }) } : { ok: true, json: async () => ({ quote: { totalCents: 2400, subtotalCents: 3000, discountCents: 600, discount: { code: "ONLYONCE" } } }) }));
  await checkout.change(checkout.form.querySelector('input[name="discountCode"]'), "onlyonce");
  await act(async () => [...checkout.form.querySelectorAll("button")].find((button) => button.textContent === "Applica").click());
  await checkout.submit(); held = true; await checkout.fail("Network timeout");
  const quoted = checkout.quoteCalls.length;
  await act(async () => checkout.closeButton.click()); await checkout.open();
  assert.equal(checkout.quoteCalls.length, quoted);
  assert.equal(checkout.submitButton.disabled, false);
  assert.match(checkout.form.textContent, /Totale24,00/);
  await checkout.submit();
  assert.deepEqual(checkout.calls[1].body, checkout.calls[0].body);
  await checkout.fail("Network timeout");
  await checkout.change(checkout.form.querySelector('input[name="nome"]'), "Altro nome");
  assert.equal(checkout.submitButton.disabled, true);
  assert.equal(checkout.quoteCalls.length, quoted + 1);
  assert.match(checkout.form.querySelector('[role="alert"]').textContent, /limite di utilizzi/);
  assert.equal(checkout.calls.length, 2);
});


for (const locale of ["it", "en", "de", "es"]) test(`${locale} legacy event affiliates are optional, localized and retained only in the checkout payload`, async (context) => {
  const affiliateId = "00000000-0000-4000-8000-000000000501";
  const checkout = await setup(context, { locale, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] });
  await checkout.open(); await checkout.fill();
  const affiliate = checkout.form.querySelector('select[name="affiliateId"]');
  const copy = checkoutCopy.checkoutCopy(locale);
  assert.equal(affiliate.required, false); assert.equal(affiliate.value, "");
  assert.equal(affiliate.getAttribute("aria-label"), copy.affiliateLabel);
  assert.equal(affiliate.options[0].textContent, copy.directPurchase);
  await checkout.change(affiliate, affiliateId);
  assert.ok(checkout.quoteCalls.every((call) => !("affiliateId" in call.body)));
  await checkout.submit();
  assert.equal(checkout.calls[0].body.affiliateId, affiliateId);
  assert.equal(checkout.calls[0].body.attendee.marketingConsent, false);
  await checkout.fail();
  await checkout.change(affiliate, ""); await checkout.submit();
  assert.equal("affiliateId" in checkout.calls.at(-1).body, false);
  await checkout.fail();
});

test("legacy purchases hide the affiliate selector entirely when the event has none", async (context) => {
  const checkout = await setup(context); await checkout.open();
  assert.equal(checkout.form.querySelector('[name="affiliateId"]'), null);
});


for (const locale of ["it", "en", "de", "es"]) test(`${locale} legacy checkout localizes unavailable affiliates and allows a direct purchase retry`, async (context) => {
  const affiliateId = "00000000-0000-4000-8000-000000000501";
  const checkout = await setup(context, { locale, affiliates: [{ id: affiliateId, name: "Scuola Meraki" }] });
  await checkout.open(); await checkout.fill();
  const affiliate = checkout.form.querySelector('select[name="affiliateId"]');
  await checkout.change(affiliate, affiliateId);
  await checkout.submit();
  await checkout.respond({ code: "affiliate_unavailable", error: "Affiliato non valido" });
  assert.equal(checkout.form.querySelector('[role="alert"]').textContent, checkoutCopy.checkoutCopy(locale).affiliateUnavailable);
  assert.equal(checkout.dialog.open, true);
  assert.equal(checkout.form.elements.namedItem("email").value, "buyer@example.test");
  await checkout.change(affiliate, ""); await checkout.submit();
  assert.equal("affiliateId" in checkout.calls.at(-1).body, false);
  assert.equal(checkout.calls.at(-1).body.buyerEmail, "buyer@example.test");
  await checkout.fail();
});

for (const locale of ["it", "en", "de", "es"]) test(`${locale} legacy checkout keeps the pending-payment instruction translated`, async (context) => {
  const checkout = await setup(context, { locale });
  await checkout.open(); await checkout.fill(); await checkout.submit();
  await checkout.respond({ code: "checkout_pending", error: "MESSAGGIO SERVER ITALIANO" });
  assert.equal(checkout.form.querySelector('[role="alert"]').textContent, checkoutCopy.checkoutFailureCopy("checkout_pending", locale));
  assert.equal(checkout.dialog.open, true);
  assert.ok(!checkout.form.textContent.includes("MESSAGGIO SERVER ITALIANO"));
});
