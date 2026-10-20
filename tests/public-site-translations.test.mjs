import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const locales = ["it", "en", "de", "es"];
const messages = Object.fromEntries(locales.map(locale => [locale, JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"))]));
function flatten(object, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}
function load(path, locale, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => modules[name] || (name === "next-intl" ? {
      useLocale: () => locale,
      useTranslations: namespace => createTranslator({ locale, namespace, messages: messages[locale], onError: error => { throw error; } }),
    } : name === "@/i18n/routing" ? { Link: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) }
      : name === "next/navigation" ? { usePathname: () => `/${locale}/legal/privacy-policy` }
      : name === "@/app/api/lead/actions" ? { submitLead: () => { throw new Error("Must not submit a lead while auditing translation"); } }
      : name === "@/lib/i18n-utils" ? { getLocalizedText: (value, currentLocale) => typeof value === "string" ? value : value?.[currentLocale] || value?.it || "" }
      : require(name)),
  });
  return exports;
}

for (const locale of locales) {
  test(`${locale}: all public translation keys and interpolation arguments match Italian and render`, () => {
    const base = flatten(messages.it);
    const catalog = flatten(messages[locale]);
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(base).sort());
    const translator = createTranslator({ locale, messages: messages[locale], onError: error => { throw error; } });
    const placeholders = text => [...text.matchAll(/\{(\w+)[,}]/g)].map(match => match[1]).sort();
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, "string", `${key} must be a string`);
      assert.ok(value.trim(), `${key} must not be empty`);
      assert.deepEqual(placeholders(value), placeholders(base[key]), `${key} interpolation arguments`);
      const values = Object.fromEntries(placeholders(value).map(name => [name, ["count", "number", "seconds"].includes(name) ? 2 : "test"]));
      assert.ok(/<\/?[a-z]/i.test(value) ? translator.raw(key) : translator(key, values), `${key} must render without an ICU error`);
    }
  });

  test(`${locale}: free trial form and legal navigation render the selected language`, () => {
    const { LeadForm } = load("src/components/public/lead-form.tsx", locale);
    const leadHtml = renderToStaticMarkup(React.createElement(LeadForm));
    const lead = new JSDOM(leadHtml).window.document;
    const copy = messages[locale].PublicUi;
    assert.equal(lead.querySelector('input[name="locale"]').value, locale);
    assert.equal(lead.querySelector('label[for="cognome"]').textContent, `${copy.lastName} *`);
    assert.equal(lead.querySelector('label[for="telefono"]').textContent, copy.phone);
    assert.equal(lead.querySelector('textarea[name="note"]').placeholder, copy.leadNotesPlaceholder);
    assert.equal(lead.querySelector('button[type="submit"]').textContent, copy.requestTrial);
    assert.equal(lead.querySelector('input[name="email"]').required, true);
    const { LegalLayout } = load("src/components/public/legal-layout.tsx", locale);
    const legal = new JSDOM(renderToStaticMarkup(React.createElement(LegalLayout, { title: messages[locale].Legal.privacy.title, lastUpdated: "20/10/2026" }, "content"))).window.document;
    assert.equal(legal.querySelector('a[href="/legal/termini-e-condizioni"]').textContent, messages[locale].Legal.terms.title);
    assert.equal(legal.querySelector('a[href="/legal/cookie-policy"]').textContent, messages[locale].Legal.cookie.title);
    assert.ok(legal.body.textContent.includes(createTranslator({ locale, namespace: "PublicUi", messages: messages[locale] })("lastUpdated", { date: "20/10/2026" })));
  });

  test(`${locale}: class schedule uses localized course data and retains 24-hour time`, () => {
    const { ScheduleClient } = load("src/app/[locale]/(public)/orario/schedule-client.tsx", locale);
    const courseNames = { it: "Prova di movimento", en: "Movement trial", de: "Bewegungsstunde", es: "Clase de movimiento" };
    const slotsByDay = { lun: [{ ora_inizio: "18:00:00", ora_fine: "19:00:00", sede: "Bolzano", course: { nome: courseNames }, istruttore: { nome: "Alex" } }] };
    const html = renderToStaticMarkup(React.createElement(ScheduleClient, { slotsByDay, fasce: ["18:00"], giorniSettimana: [{ id: "lun", label: messages[locale].Index.schedule.days.lun, short: messages[locale].Index.schedule.days.lun }], locations: ["Bolzano"] }));
    const document = new JSDOM(html).window.document;
    assert.equal(document.querySelector("button").textContent.trim(), messages[locale].PublicUi.allLocations);
    assert.ok(document.body.textContent.includes(courseNames[locale]));
    assert.ok(document.body.textContent.includes("18:00 – 19:00"));
    assert.ok(document.body.textContent.includes(createTranslator({ locale, namespace: "PublicUi", messages: messages[locale] })("withInstructor", { name: "Alex" })));
    assert.doesNotMatch(document.body.textContent, /\b(?:AM|PM)\b/);
  });
}

for (const locale of locales) {
  test(`${locale}: translated other-location filter keeps the original database value`, async () => {
    const { act } = React;
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { pretendToBeVisual: true });
    const originals = new Map();
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(dom.window.document.getElementById("root"));
    try {
      const { ScheduleClient } = load("src/app/[locale]/(public)/orario/schedule-client.tsx", locale);
      const slotsByDay = { lun: [
        { ora_inizio: "18:00:00", ora_fine: "19:00:00", sede: "Altro", course: { nome: "Keep this course" } },
        { ora_inizio: "18:00:00", ora_fine: "19:00:00", sede: "Bolzano", course: { nome: "Hide this course" } },
      ] };
      await act(async () => root.render(React.createElement(ScheduleClient, { slotsByDay, fasce: ["18:00"], giorniSettimana: [{ id: "lun", label: "Monday", short: "MON" }], locations: ["Bolzano", "Altro"] })));
      const button = [...dom.window.document.querySelectorAll("button")].find(element => element.textContent.trim() === messages[locale].PublicUi.otherLocation);
      assert.ok(button, "The location label is translated");
      await act(async () => button.click());
      assert.ok(dom.window.document.body.textContent.includes("Keep this course"));
      assert.ok(!dom.window.document.body.textContent.includes("Hide this course"));
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
}

async function spanishLegalPage(route) {
  const { LegalLayout } = load("src/components/public/legal-layout.tsx", "es");
  const pageModule = load(`src/app/[locale]/(public)/legal/${route}/page.tsx`, "es", {
    "@/components/public/legal-layout": { LegalLayout },
    "next-intl/server": { getTranslations: async ({ locale, namespace }) => createTranslator({ locale, namespace, messages: messages[locale], onError: error => { throw error; } }) },
  });
  const page = await pageModule.default({ params: Promise.resolve({ locale: "es" }) });
  return new JSDOM(renderToStaticMarkup(page)).window.document;
}

function paragraphAfter(document, heading) {
  const title = [...document.querySelectorAll("h2")].find(element => heading.test(element.textContent));
  assert.ok(title, `Missing legal section ${heading}`);
  return title.nextElementSibling.textContent;
}

test("Spanish membership terms retain annual membership and required medical documentation", async () => {
  const text = paragraphAfter(await spanishLegalPage("termini-e-condizioni"), /inscripción en la asociación/);
  assert.match(text, /reservada a los miembros/);
  assert.match(text, /inscripción anual/);
  assert.match(text, /no sustituye la obligación/);
  assert.match(text, /certificado médico.*no competitiva/);
});

test("Spanish privacy storage keeps staff access, separate campaign data and withdrawal rights", async () => {
  const text = paragraphAfter(await spanishLegalPage("privacy-policy"), /Conservación y seguridad/);
  assert.match(text, /limitado al personal autorizado/);
  assert.match(text, /teléfonos y documentos.*separados de la lista para campañas/);
  assert.match(text, /Stripe.*datos de pago/);
  assert.match(text, /obligaciones aplicables/);
  assert.match(text, /consentimiento.*retirarse en cualquier momento/);
});

test("Spanish privacy makes optional marketing independent from purchase and ticket delivery", async () => {
  const document = await spanishLegalPage("privacy-policy");
  const text = [...document.querySelectorAll("main li")].map(element => element.textContent).find(value => /consentimiento de marketing/.test(value));
  assert.ok(text);
  assert.match(text, /opcional/);
  assert.match(text, /separado de la compra/);
  assert.match(text, /no preseleccionado/);
  assert.match(text, /confirmación personal por email/);
  assert.match(text, /no impide comprar ni recibir la entrada/);
});

test("Spanish privacy withdrawal needs no account and preserves the ticket and service emails", async () => {
  const text = paragraphAfter(await spanishLegalPage("privacy-policy"), /Tus derechos/);
  for (const right of ["acceso", "rectificación", "eliminación"]) assert.ok(text.includes(right));
  assert.match(text, /enlace personal.*sin una cuenta/);
  assert.match(text, /no cancela la entrada/);
  assert.match(text, /ni bloquea las comunicaciones necesarias para la compra/);
});

test("order confirmation localizes known statuses and safely handles missing or unexpected status", async () => {
  for (const locale of locales) {
    for (const status of ["paid", null, "unexpected-provider-status"]) {
      const order = { status, buyer_email: "buyer@example.test", numero_ordine: "ORDER-TEST", created_at: "2026-10-20T18:00:00Z", items: [], subtotal_cents: 4500, shipping_cents: 0, total_cents: 4500 };
      const page = load("src/app/[locale]/(public)/ordine/[id]/conferma/page.tsx", locale, {
        "next-intl/server": { getTranslations: async namespace => createTranslator({ locale, namespace, messages: messages[locale], onError: error => { throw error; } }) },
        "@/lib/supabase/server": { createClient: async () => ({ from() { return { select() { return this; }, eq() { return this; }, single: async () => ({ data: order, error: null }) }; } }) },
      });
      const document = new JSDOM(renderToStaticMarkup(await page.default({ params: Promise.resolve({ id: "order-test" }) }))).window.document;
      assert.equal(document.querySelector("span.uppercase").textContent, messages[locale].OrderStatuses[status === "paid" ? "paid" : "unknown"]);
      assert.doesNotMatch(document.body.textContent, /unexpected-provider-status/);
    }
  }
});
