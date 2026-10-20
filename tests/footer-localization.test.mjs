import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { nativeFormControlMocks } from "./helpers/native-form-controls.mjs";

const require = createRequire(import.meta.url);
const locales = ["it", "en", "de", "es"];
const messages = Object.fromEntries(locales.map(locale => [locale, JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"))]));
function load(path, locale, modules = {}, environment = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, ...environment, require: name => modules[name] || (name === "next-intl" ? {
    useLocale: () => locale,
    useTranslations: namespace => createTranslator({ locale, namespace, messages: messages[locale], onError: error => { throw error; } }),
  } : name === "@/i18n/routing" ? { Link: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) }
    : name === "next/image" ? { __esModule: true, default: props => React.createElement("img", Object.fromEntries(Object.entries(props).filter(([key]) => key !== "fill"))) }
    : require(name)) });
  return exports;
}
const i18n = load("src/lib/i18n-utils.ts", "it");
const localized = prefix => Object.fromEntries(locales.map(locale => [locale, `${prefix} ${locale}`]));
const footerText = { about_us: localized("Association description"), copyright: localized("Rights reserved") };
const contacts = { email: "info@example.test", pec: "pec@example.test", phone: "+390000000000", vat: "IT00000000000", address: "Via Esempio 1", address_short: localized("Short address") };

for (const locale of locales) {
  test(`${locale}: footer renders all three configured multilingual fields`, () => {
    const { Footer } = load("src/components/public/footer.tsx", locale, { "@/lib/i18n-utils": i18n });
    const document = new JSDOM(renderToStaticMarkup(React.createElement(Footer, { footerData: footerText, contacts }))).window.document;
    for (const text of [footerText.about_us[locale], footerText.copyright[locale], contacts.address_short[locale]]) assert.ok(document.body.textContent.includes(text));
    for (const other of locales.filter(value => value !== locale)) assert.ok(!document.body.textContent.includes(footerText.about_us[other]));
    assert.doesNotMatch(document.body.textContent, /\[object Object\]/);
  });

  test(`${locale}: footer preserves legacy strings and uses Italian when a translation is empty`, () => {
    const { Footer } = load("src/components/public/footer.tsx", locale, { "@/lib/i18n-utils": i18n });
    const legacy = { about_us: "Legacy association description", copyright: "Legacy rights" };
    const legacyContacts = { ...contacts, address_short: "Legacy short address" };
    const legacyText = new JSDOM(renderToStaticMarkup(React.createElement(Footer, { footerData: legacy, contacts: legacyContacts }))).window.document.body.textContent;
    for (const value of [...Object.values(legacy), legacyContacts.address_short]) assert.ok(legacyText.includes(value));
    const italianFallback = { it: "Fallback italiano", en: "", de: "", es: "" };
    const fallbackText = new JSDOM(renderToStaticMarkup(React.createElement(Footer, { footerData: { about_us: italianFallback, copyright: italianFallback }, contacts: { ...contacts, address_short: italianFallback } }))).window.document.body.textContent;
    assert.equal(fallbackText.split("Fallback italiano").length - 1, 3);
  });
}

test("settings translates an existing string, submits its complete language object and reloads it without changing other fields", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { pretendToBeVisual: true });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  const submitted = [];
  const formElements = load("src/components/admin/form-elements.tsx", "it", { ...nativeFormControlMocks, "next/dynamic": { __esModule: true, default: () => () => null } });
  const { SettingsClient } = load("src/app/[locale]/admin/impostazioni/settings-client.tsx", "it", {
    "@/components/admin/form-elements": formElements,
    "@/app/api/admin/impostazioni/actions": { saveHomepageContent: async data => { submitted.push(JSON.parse(data.get("payload"))); return { success: true }; } },
    "@/app/api/admin/upload/actions": { uploadImageAction: () => { throw new Error("Image upload is outside this test"); } },
    "@/app/api/admin/team/actions": { upsertTeamMember() {}, deleteTeamMember() {} },
    "@/lib/image-utils": { compressImageToWebp() {} },
    "@/components/ui/modal-provider": { useModal: () => ({ showAlert() {}, showConfirm() {} }) },
  }, { FormData: dom.window.FormData, setTimeout: () => 0 });
  const initialData = { footer_text: { ...footerText, about_us: "Descrizione originale italiana" }, contacts };
  try {
    await act(async () => root.render(React.createElement(SettingsClient, { initialData })));
    assert.equal(dom.window.document.querySelectorAll("[data-multilingual-field]").length, 3, "Only the requested three settings gain language tabs");
    let about = dom.window.document.getElementById("footer-about-us");
    assert.equal(about.value, "Descrizione originale italiana");
    const germanTab = [...about.closest("[data-multilingual-field]").querySelectorAll("button")].find(button => button.textContent === "de");
    await act(async () => germanTab.click());
    assert.equal(about.value, "");
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(about, "Beschreibung auf Deutsch");
      about.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0].footer_text.about_us, { it: "Descrizione originale italiana", de: "Beschreibung auf Deutsch" });
    assert.deepEqual(submitted[0].footer_text.copyright, footerText.copyright);
    assert.deepEqual(submitted[0].contacts, contacts, "Editing footer description must not modify address or contact details");
    await act(async () => root.render(React.createElement(SettingsClient, { key: "reload", initialData: submitted[0] })));
    about = dom.window.document.getElementById("footer-about-us");
    assert.equal(about.value, "Descrizione originale italiana");
    await act(async () => [...about.closest("[data-multilingual-field]").querySelectorAll("button")].find(button => button.textContent === "de").click());
    assert.equal(about.value, "Beschreibung auf Deutsch");
    for (const id of ["footer-copyright", "footer-address-short"]) {
      const field = dom.window.document.getElementById(id);
      await act(async () => [...field.closest("[data-multilingual-field]").querySelectorAll("button")].find(button => button.textContent === "es").click());
      assert.equal(field.value, id === "footer-copyright" ? footerText.copyright.es : contacts.address_short.es);
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
