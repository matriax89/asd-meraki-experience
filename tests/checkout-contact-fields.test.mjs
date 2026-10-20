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
const contactModule = load("src/components/meraki/checkout-contact-fields.tsx", {
  "./checkout-copy": copyModule,
  "./commerce-purchase.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
});

async function mount(context, locale, props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const changes = [];
  const root = createRoot(host);
  function Harness() {
    const [value, setValue] = React.useState(() => ({ ...contactModule.emptyCheckoutContact(locale), email: "guest@example.test", phone: "+393331234567", documentNumber: locale === "it" ? "RSSMRA80A01H501U" : "ABC123456" }));
    return React.createElement("form", null, React.createElement(contactModule.CheckoutContactFields, {
      locale, prefix: "guest", value, ...props,
      onChange(next) { changes.push(next); setValue((current) => ({ ...current, ...next })); },
    }));
  }
  await act(async () => root.render(React.createElement(Harness)));
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  return { host, changes, form: host.querySelector("form") };
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
    assert.ok(promotion.closest("label").textContent.includes(copy.marketing));
    assert.equal(host.querySelector("#guest-marketing-hint").textContent, copy.marketingHint);
    assert.equal(form.checkValidity(), true, "The required attendee data permits purchase without promotions");
    assert.deepEqual(changes, [], "Ticket/service email information must not create consent");
    await act(async () => promotion.click());
    assert.equal(promotion.checked, true);
    assert.deepEqual(JSON.parse(JSON.stringify(changes)), [{ marketingConsent: true }]);
    assert.equal(email.value, "guest@example.test");
    await act(async () => promotion.click());
    assert.equal(promotion.checked, false);
    assert.equal(form.checkValidity(), true);
    assert.equal(host.querySelector("#guest-operational-email-hint").textContent, copy.operationalEmailHint);
  });
}

test("waiting-list and original-email forms do not promise automatic ticket delivery", async (context) => {
  const { host, form } = await mount(context, "it", { emailOnly: true, originalEmail: true });
  assert.equal(host.querySelector('input[type="email"]').required, true);
  assert.equal(host.querySelectorAll("input").length, 1);
  assert.equal(host.querySelector("#guest-operational-email-hint"), null);
  assert.equal(host.querySelector('input[type="checkbox"]'), null);
  assert.equal(form.checkValidity(), true);
});

test("pending purchase locks the optional promotion choice without enrolling anyone", async (context) => {
  const { host, changes } = await mount(context, "it", { disabled: true, group: true });
  const promotion = host.querySelector('input[type="checkbox"]');
  assert.equal(promotion.checked, false);
  assert.equal(promotion.disabled, true);
  assert.ok(host.textContent.includes(copyModule.checkoutCopy("it").groupConsent));
  await act(async () => promotion.click());
  assert.deepEqual(changes, []);
  assert.equal(host.querySelector('input[type="email"]').disabled, true);
});
