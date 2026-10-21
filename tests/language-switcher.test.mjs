import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks = {}, context = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => mocks[id] || (id.endsWith(".module.css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } : require(id)), ...context });
  return compiledModule.exports;
}

const languages = { it: ["Lingua", "Italiano"], en: ["Language", "English"], de: ["Sprache", "Deutsch"], es: ["Idioma", "Español"] };

async function mount(context, { locale = "it", profile = false, url = "https://meraki.test/it/biglietto/fixture?token=private%2Btoken&source=mail#accessi" } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><button id="outside">Outside</button></body></html>', { url, pretendToBeVisual: true });
  const { window } = dom;
  const descriptors = new Map();
  for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const replaced = [];
  const router = { replace: (...args) => replaced.push(args) };
  const browser = { window, document: window.document };
  const choice = load("i18n/locale-choice.ts", {}, browser);
  const component = profile ? load("components/meraki/profile.tsx", {
    "next/navigation": { usePathname: () => window.location.pathname, useRouter: () => router },
    "@/i18n/routing": { Link: ({ children, ...props }) => createElement("a", props, children) },
    "@/components/pwa/install-card": { InstallCard: () => null },
    "@/i18n/locale-choice": choice,
  }, browser).MerakiProfile : load("components/public/language-switcher.tsx", {
    "next-intl": { useLocale: () => locale, useTranslations: () => () => languages[locale][0] },
    "@/i18n/routing": { usePathname: () => window.location.pathname.replace(/^\/(it|en|de|es)(?=\/|$)/, ""), useRouter: () => router },
    "@/i18n/locale-choice": choice,
  }, browser).LanguageSwitcher;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(createElement(component, profile ? { locale } : { compact: true, align: "start" })));
  context.after(async () => {
    await act(async () => root.unmount());
    window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    window, document: window.document, replaced,
    trigger: () => window.document.querySelector('button[aria-haspopup="menu"]'),
    async click(element) { await act(async () => element.click()); },
    async key(element, key) { await act(async () => element.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))); },
  };
}

test("manual preferences only write the four supported languages with year-long first-party cookies", () => {
  const writes = [];
  const choice = load("i18n/locale-choice.ts", {}, { document: { set cookie(value) { writes.push(value); } }, window: { location: { protocol: "https:" } } });
  for (const locale of ["it", "en", "de", "es"]) {
    choice.rememberLocaleChoice(locale);
    assert.equal(writes.at(-2), `MERAKI_LOCALE_CHOICE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    assert.equal(writes.at(-1), `NEXT_LOCALE=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  }
  const count = writes.length;
  for (const locale of ["fr", "IT", "it; unsafe=1", ""]) choice.rememberLocaleChoice(locale);
  assert.equal(writes.length, count);
  assert.doesNotThrow(() => load("i18n/locale-choice.ts").rememberLocaleChoice("it"), "server imports do not access browser globals");
});

for (const locale of ["it", "en", "de", "es"]) test(`${locale}: a compact labelled selector exposes all language names and the current choice`, async (context) => {
  const ui = await mount(context, { locale, url: `https://meraki.test/${locale}/eventi` });
  const trigger = ui.trigger();
  assert.equal(trigger.type, "button");
  assert.equal(trigger.getAttribute("aria-label"), `${languages[locale][0]}: ${languages[locale][1]}`);
  assert.match(trigger.textContent, new RegExp(locale.toUpperCase()));
  await ui.click(trigger);
  const menu = ui.document.querySelector('[role="menu"]');
  assert.equal(trigger.getAttribute("aria-controls"), menu.id);
  const options = [...menu.querySelectorAll('[role="menuitemradio"]')];
  assert.deepEqual(options.map((option) => option.textContent), Object.values(languages).map((labels) => labels[1]));
  assert.equal(options.filter((option) => option.getAttribute("aria-checked") === "true").length, 1);
  assert.equal(ui.document.activeElement.lang, locale);
});

test("changing language preserves ticket credentials, query parameters and anchor without scrolling", async (context) => {
  const ui = await mount(context);
  await ui.click(ui.trigger());
  await ui.click(ui.document.querySelector('[role="menuitemradio"][lang="de"]'));
  assert.equal(ui.replaced.length, 1);
  assert.equal(ui.replaced[0][0], "/biglietto/fixture?token=private%2Btoken&source=mail#accessi");
  assert.equal(ui.replaced[0][1].locale, "de");
  assert.equal(ui.replaced[0][1].scroll, false);
  assert.match(ui.document.cookie, /MERAKI_LOCALE_CHOICE=de/);
  assert.match(ui.document.cookie, /NEXT_LOCALE=de/);
  assert.equal(ui.document.querySelector('[role="menu"]'), null);
  assert.equal(ui.document.activeElement, ui.trigger());
});

test("selecting the current language also remembers an explicit choice without navigating", async (context) => {
  const ui = await mount(context);
  await ui.click(ui.trigger());
  await ui.click(ui.document.querySelector('[role="menuitemradio"][lang="it"]'));
  assert.equal(ui.replaced.length, 0);
  assert.match(ui.document.cookie, /MERAKI_LOCALE_CHOICE=it/);
  assert.match(ui.document.cookie, /NEXT_LOCALE=it/);
});

test("keyboard navigation, Escape, Tab and outside interaction dismiss the language menu", async (context) => {
  const ui = await mount(context);
  await ui.key(ui.trigger(), "ArrowDown");
  assert.equal(ui.document.activeElement.lang, "it");
  await ui.key(ui.document.activeElement, "ArrowDown");
  assert.equal(ui.document.activeElement.lang, "en");
  await ui.key(ui.document.activeElement, "End");
  assert.equal(ui.document.activeElement.lang, "es");
  await ui.key(ui.document.activeElement, "ArrowDown");
  assert.equal(ui.document.activeElement.lang, "it");
  await ui.key(ui.document.activeElement, "Escape");
  assert.equal(ui.document.querySelector('[role="menu"]'), null);
  assert.equal(ui.document.activeElement, ui.trigger());
  await ui.key(ui.trigger(), "ArrowUp");
  assert.equal(ui.document.activeElement.lang, "es");
  await ui.key(ui.document.activeElement, "Home");
  assert.equal(ui.document.activeElement.lang, "it");
  await ui.key(ui.document.activeElement, "Tab");
  assert.equal(ui.document.querySelector('[role="menu"]'), null);
  await ui.click(ui.trigger());
  await act(async () => ui.document.getElementById("outside").dispatchEvent(new ui.window.Event("pointerdown", { bubbles: true })));
  assert.equal(ui.document.querySelector('[role="menu"]'), null);
});

test("the existing profile language options remember current and new choices too", async (context) => {
  const ui = await mount(context, { profile: true, url: "https://meraki.test/it/profilo?source=home#lingua" });
  await ui.click(ui.document.querySelector('button[lang="it"]'));
  assert.match(ui.document.cookie, /MERAKI_LOCALE_CHOICE=it/);
  assert.equal(ui.replaced.length, 0);
  await ui.click(ui.document.querySelector('button[lang="es"]'));
  assert.match(ui.document.cookie, /MERAKI_LOCALE_CHOICE=es/);
  assert.equal(ui.replaced[0][0], "/es/profilo?source=home#lingua");
  assert.equal(ui.replaced[0][1].scroll, false);
});
