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
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/eventi/test", pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function load(path, modules = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Intl, require: (name) => modules[name] || nativeFormControlMocks[name] || require(name) });
  return exports;
}
const copyModule = load("src/components/meraki/checkout-copy.ts");
const phoneModule = load("src/lib/commerce/phone-country.ts");
const contactModule = load("src/components/meraki/checkout-contact-fields.tsx", {
  "./checkout-copy": copyModule,
  "@/lib/commerce/phone-country": phoneModule,
  "./commerce-purchase.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
});

async function mount(context, locale, props = {}, initialContact = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const changes = [];
  const root = createRoot(host);
  function Harness() {
    const [value, setValue] = React.useState(() => ({ ...contactModule.emptyCheckoutContact(locale), email: "guest@example.test", phone: "+393331234567", documentNumber: locale === "it" ? "RSSMRA80A01H501U" : "ABC123456", ...initialContact }));
    return React.createElement("form", null, React.createElement(contactModule.CheckoutContactFields, {
      locale, prefix: "guest", value, ...props,
      onChange(next) { changes.push(next); setValue((current) => ({ ...current, ...next })); },
    }));
  }
  await act(async () => root.render(React.createElement(Harness)));
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const change = async (field, value) => act(async () => {
    const prototype = field.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
    field.dispatchEvent(new dom.window.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  return { host, changes, change, form: host.querySelector("form") };
}

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale}: ticket emails are automatic and purchase never requires promotional consent`, async (context) => {
    const { host, form, changes } = await mount(context, locale);
    const copy = copyModule.checkoutCopy(locale);
    const email = host.querySelector('input[type="email"]');
    assert.equal(email.required, true);
    assert.equal(host.querySelector("#guest-operational-email-hint").textContent, copy.operationalEmailHint);
    assert.ok(email.getAttribute("aria-describedby").split(" ").includes("guest-operational-email-hint"));
    assert.equal(host.querySelector('[role="switch"]'), null);
    const promotion = host.querySelector('input[type="checkbox"]');
    assert.equal(promotion.checked, false);
    assert.equal(promotion.required, false);
    assert.equal(promotion.closest("label").textContent, copy.marketing);
    assert.ok(copy.marketing.length < 70, "Consent uses one short sentence");
    assert.equal(host.querySelector("#guest-marketing-hint"), null);
    assert.equal(contactModule.emptyCheckoutContact(locale).marketingConsent, false);
    assert.equal(form.checkValidity(), true, "The required attendee data permits purchase without promotions");
    assert.deepEqual(changes, [], "Ticket/service email information must not create consent");
    await act(async () => promotion.click());
    assert.equal(promotion.checked, true);
    assert.deepEqual(JSON.parse(JSON.stringify(changes)), [{ marketingConsent: true }]);
    await act(async () => promotion.click());
    assert.equal(promotion.checked, false);
    assert.equal(email.value, "guest@example.test");
    assert.equal(form.checkValidity(), true);
    assert.equal(host.querySelector("#guest-operational-email-hint").textContent, copy.operationalEmailHint);
  });
}

for (const locale of ["it", "en", "de", "es"]) {
  for (const documentType of ["codice_fiscale", "foreign_id"]) {
    test(`${locale}: a blank ${documentType} never blocks native form validation`, async context => {
      const { host, form, changes } = await mount(context, locale, {}, { documentType, documentCountry: "", documentNumber: "" });
      const copy = copyModule.checkoutCopy(locale);
      const type = host.querySelector("#guest-document-type");
      const number = host.querySelector("#guest-document-number");
      const country = host.querySelector("#guest-document-country");
      const phone = host.querySelector("#guest-phone");
      assert.equal(type.required, false);
      assert.equal(type.value, documentType);
      assert.deepEqual([...type.options].map(option => option.value), ["codice_fiscale", "foreign_id"]);
      assert.ok(type.closest("label").textContent.startsWith(`${copy.documentType} (${copy.optional})`));
      assert.equal(host.querySelector("#guest-document-type-hint").textContent, copy.documentTypeHint);
      assert.equal(number.required, false);
      assert.equal(number.hasAttribute("minlength"), false);
      assert.equal(number.placeholder, documentType === "codice_fiscale" ? copy.fiscalNumberPlaceholder : copy.documentNumberPlaceholder);
      assert.ok(number.closest("label").textContent.startsWith(`${documentType === "codice_fiscale" ? copy.fiscalNumber : copy.documentNumber} (${copy.optional})`));
      assert.equal(host.querySelector("#guest-document-number-hint").textContent, copy.documentHint);
      assert.equal(country?.required || false, false);
      assert.equal(form.reportValidity(), true);
      assert.equal(host.querySelector("#guest-email").required, true);
      assert.equal(phone.required, true);
      assert.ok(phone.placeholder.startsWith(phoneModule.phoneCallingCode(host.querySelector("#guest-phone-country").value)));
      assert.match(phone.placeholder, /^\+\d/);
      assert.equal(host.querySelector("#guest-phone-hint").textContent, copy.phoneHint);
      assert.equal(phone.getAttribute("aria-describedby"), "guest-phone-hint");
      assert.deepEqual(changes, [], "showing an optional document never invents identity or consent data");
    });
  }

  test(`${locale}: issuing country is required only while a foreign document number is present`, async context => {
    const { host, form, change, changes } = await mount(context, locale, {}, { documentType: "foreign_id", documentCountry: "", documentNumber: "" });
    const copy = copyModule.checkoutCopy(locale);
    const number = host.querySelector("#guest-document-number");
    const country = host.querySelector("#guest-document-country");
    assert.equal(country.required, false);
    assert.equal(form.reportValidity(), true);
    assert.equal(host.querySelector("#guest-document-country-hint").textContent, copy.documentCountryHint);
    await change(number, "abc123456");
    assert.equal(number.value, "ABC123456");
    assert.equal(country.required, true);
    assert.equal(country.validity.valueMissing, true);
    assert.equal(form.reportValidity(), false);
    await change(country, "DE");
    assert.equal(form.reportValidity(), true);
    await change(number, ""); await change(country, "");
    assert.equal(country.required, false);
    assert.equal(form.reportValidity(), true);
    await change(number, "   ");
    assert.equal(country.required, false, "whitespace is not an entered identity number");
    assert.equal(number.hasAttribute("minlength"), false);
    assert.equal(form.reportValidity(), true);
    await change(host.querySelector("#guest-phone"), "3331234567");
    assert.equal(host.querySelector("#guest-phone").value, "+393331234567");
    assert.deepEqual(JSON.parse(JSON.stringify(changes.at(-1))), { phone: "+393331234567" }, "the visible selected country supplies the calling code");
  });
}

test("changing the document type clears the previous number without making the new document mandatory", async context => {
  const { host, form, change } = await mount(context, "it");
  const number = host.querySelector("#guest-document-number");
  await change(host.querySelector("#guest-document-type"), "foreign_id");
  assert.equal(number.value, "");
  assert.equal(host.querySelector("#guest-document-country").value, "");
  assert.equal(host.querySelector("#guest-document-country").required, false);
  assert.equal(form.reportValidity(), true);
  await change(host.querySelector("#guest-document-type"), "codice_fiscale");
  assert.equal(host.querySelector("#guest-document-country"), null);
  assert.equal(number.required, false);
  assert.equal(form.reportValidity(), true);
});

test("waiting-list and original-email forms do not promise automatic ticket delivery", async (context) => {
  const { host, form } = await mount(context, "it", { emailOnly: true, originalEmail: true });
  assert.equal(host.querySelector('input[type="email"]').required, true);
  assert.equal(host.querySelectorAll("input").length, 1);
  assert.equal(host.querySelector("#guest-operational-email-hint"), null);
  assert.equal(host.querySelector('input[type="checkbox"]'), null);
  assert.equal(form.checkValidity(), true);
});

test("a field-specific error is announced only next to its own contact control and preserves its existing hints", async context => {
  for (const [field, id, hint] of [
    ["email", "guest-email", "guest-email-hint"],
    ["phone", "guest-phone", "guest-phone-hint"],
    ["documentType", "guest-document-type", "guest-document-type-hint"],
    ["documentCountry", "guest-document-country", "guest-document-country-hint"],
    ["documentNumber", "guest-document-number", "guest-document-number-hint"],
  ]) {
    const message = `Controlla questo campo: ${field}`;
    const { host } = await mount(context, "it", { validationError: { field, message } }, { documentType: "foreign_id", documentCountry: "DE", documentNumber: "ABC123456" });
    const control = host.querySelector(`#${id}`);
    assert.equal(control.getAttribute("aria-invalid"), "true");
    assert.equal(host.querySelectorAll('[aria-invalid="true"]').length, 1);
    const describedBy = control.getAttribute("aria-describedby").split(" ");
    assert.ok(describedBy.includes(hint));
    assert.ok(describedBy.includes(`guest-${field}-error`));
    assert.equal(host.querySelectorAll('[role="alert"]').length, 1);
    const alert = host.querySelector('[role="alert"]');
    assert.equal(alert.id, `guest-${field}-error`);
    assert.equal(alert.textContent, message);
    assert.ok((field === "phone" ? control.closest("label").parentElement.parentElement : control.closest("label")).contains(alert));
    assert.ok(host.querySelector("#guest-email").getAttribute("aria-describedby").includes("guest-operational-email-hint"));
  }
});

test("pending purchase locks the contact fields and optional consent without enrolling anyone", async (context) => {
  const { host, changes } = await mount(context, "it", { disabled: true });
  const promotion = host.querySelector('input[type="checkbox"]');
  assert.equal(promotion.checked, false);
  assert.equal(promotion.disabled, true);
  await act(async () => promotion.click());
  assert.deepEqual(changes, []);
  assert.equal(host.querySelector('input[type="email"]').disabled, true);
});

for (const [locale, country, number, expected] of [
  ["it", "IT", "3331234567", "+393331234567"],
  ["en", "GB", "07700900123", "+447700900123"],
  ["de", "DE", "015112345678", "+4915112345678"],
  ["es", "ES", "612345678", "+34612345678"],
]) test(`${locale}: choosing a country inserts its prefix and typing a national number completes it`, async context => {
  const { host, change, changes } = await mount(context, locale, {}, { phone: "", documentNumber: "" });
  const select = host.querySelector("#guest-phone-country");
  const phone = host.querySelector("#guest-phone");
  assert.equal(select.value, country);
  assert.ok(select.labels[0].textContent.startsWith(copyModule.checkoutCopy(locale).phoneCountry));
  assert.ok(select.options.length > 240);
  assert.match(select.selectedOptions[0].textContent, /\(\+\d+\)$/);
  assert.equal(phone.value, "");
  assert.deepEqual(changes, [], "A default country does not invent a phone number");
  await change(select, country);
  assert.equal(phone.value, phoneModule.phoneCallingCode(country));
  await change(phone, number);
  assert.equal(phone.value, expected);
  assert.equal(select.value, country);
  assert.deepEqual(JSON.parse(JSON.stringify(changes.at(-1))), { phone: expected });
});

test("pasted international phone numbers update the country without adding a duplicate prefix", async context => {
  const { host, change } = await mount(context, "it", {}, { phone: "", documentNumber: "" });
  const select = host.querySelector("#guest-phone-country");
  const phone = host.querySelector("#guest-phone");
  await change(phone, "0044 (0)7700 900123");
  assert.equal(phone.value, "+447700900123");
  assert.equal(select.value, "GB");
  await change(phone, "+39 02 1234 5678");
  assert.equal(phone.value, "+390212345678");
  assert.equal(select.value, "IT");
  await change(select, "FR");
  assert.equal(phone.value, "+330212345678");
  assert.equal(select.value, "FR");
  await change(phone, "");
  assert.equal(select.value, "FR");
  await change(phone, "0612345678");
  assert.equal(phone.value, "+33612345678");
});

test("explicit country choices sharing a calling code remain selected", async context => {
  const { host, change } = await mount(context, "it", {}, { phone: "+12045551234", documentNumber: "" });
  const select = host.querySelector("#guest-phone-country");
  const phone = host.querySelector("#guest-phone");
  assert.equal(select.value, "CA");
  await change(select, "US");
  assert.equal(select.value, "US");
  assert.equal(phone.value, "+12045551234");
  await change(select, "CA");
  assert.equal(select.value, "CA");
  assert.equal(phone.value, "+12045551234");
});

test("each country selection stays separate from document country, consent and disabled states", async context => {
  const { host, change } = await mount(context, "it", {}, { documentType: "foreign_id", documentCountry: "ES", documentNumber: "" });
  await change(host.querySelector("#guest-phone-country"), "DE");
  assert.equal(host.querySelector("#guest-document-country").value, "ES");
  assert.equal(host.querySelector('[type="checkbox"]').checked, false);
  const disabled = await mount(context, "en", { disabled: true }, { phone: "" });
  assert.equal(disabled.host.querySelector("#guest-phone-country").disabled, true);
  assert.equal(disabled.host.querySelector("#guest-phone").disabled, true);
});
