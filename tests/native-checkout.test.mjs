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
const contactFields = compileDependency("../src/components/meraki/checkout-contact-fields.tsx", { "./checkout-copy": checkoutCopy, "./commerce-purchase.module.css": cssModule });
const dependencies = {
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

async function setup(context, { overflow = "auto", locale = "it" } = {}) {
  window.document.body.innerHTML = '<div id="checkout-root"></div>';
  window.document.body.style.overflow = overflow;
  const calls = [];
  let uuidCalls = 0;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window,
    document: window.document,
    FormData: window.FormData,
    URL,
    Error,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, "0")}` },
    fetch: (url, options) => {
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
  await act(async () => root.render(React.createElement(exports.CheckoutButton, { eventId })));
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
  return { dialog, trigger, form, submitButton, closeButton, calls, fill, open, submit, respond, fail, escape, dispose };
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
  assert.deepEqual(inputs.map((input) => input.name), ["nome", "cognome", "email", "buyer-phone", "buyer-document-number", "buyer-marketing-consent"]);
  assert.ok(inputs.filter((input) => input.type !== "checkbox").every((input) => input.required));
  assert.equal(inputs.at(-1).checked, false);
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
  assert.ok([...checkout.form.querySelectorAll("input, button")].every((element) => !element.disabled));
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
});


test("guest contact fields reject invalid documents before starting a payment", async (context) => {
  const checkout = await setup(context);
  await checkout.open();
  await checkout.fill();
  const documentInput = checkout.form.elements.namedItem("buyer-document-number");
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(documentInput, "RSSMRA85T10A562A"); documentInput.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await checkout.submit();
  assert.equal(checkout.calls.length, 0);
  assert.match(checkout.dialog.querySelector('[role="alert"]').textContent, /Controlla i dati/);
});
