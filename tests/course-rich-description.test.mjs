import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { createTranslator } from "next-intl";
import { eventDescription } from "./helpers/rich-text-modules.mjs";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : require(name) });
  return compiledModule.exports;
}
const names = { it: "Corso Meraki", en: "Meraki course", de: "Meraki Kurs", es: "Curso Meraki" };
const texts = { it: "Descrizione italiana", en: "English description", de: "Deutsche Beschreibung", es: "Descripción española" };
const full = Object.fromEntries(Object.entries(texts).map(([locale, value]) => [locale, `<p><strong>${value}</strong> <em>Meraki</em></p><ul><li>Primo punto</li></ul><img src=x onerror=alert(1)><script>alert(2)</script>`]));
const row = { nome: names, slug: "corso-meraki", descrizione_breve: texts, descrizione_lunga: full, copertina_url: null, benefici: null, galleria_urls: [], istruttore: null };
const course = load("app/[locale]/(public)/corsi/[slug]/page.tsx", {
  "next-intl/server": { getTranslations: async ({ locale, namespace }) => createTranslator({ locale, namespace, messages: JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8")), onError: error => { throw error; } }) },
  "next/navigation": { notFound() { throw Error("Not found"); } },
  "@/lib/supabase/server": { createClient: async () => ({ from() { return { select() { return this; }, eq() { return this; }, single: async () => ({ data: row }) }; } }) },
  "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/components/seo/json-ld": { JsonLd: () => null },
  "@/lib/i18n-utils": load("lib/i18n-utils.ts"),
  "@/components/public/event-description": eventDescription,
});

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale} course renders rich long copy safely while keeping the short SEO description plain`, async () => {
    const params = Promise.resolve({ slug: row.slug, locale });
    const html = renderToStaticMarkup(await course.default({ params }));
    const fragment = JSDOM.fragment(html);
    const description = fragment.querySelector("[data-rich-text]");
    assert.equal(description.querySelector("strong").textContent, texts[locale]);
    assert.equal(description.querySelector("em").textContent, "Meraki");
    assert.equal(description.querySelector("ul > li").textContent, "Primo punto");
    assert.equal(description.querySelector("img,script"), null);
    assert.equal(description.textContent.includes("alert("), false);
    assert.equal((await course.generateMetadata({ params })).description, texts[locale]);
  });
}
