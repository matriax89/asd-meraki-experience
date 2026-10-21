import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const locales = ["it", "en", "de", "es"];
function evaluate(source, mocks = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Intl, require: (name) => mocks[name] || require(name) });
  return exports;
}
function source(path) { return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"); }
function load(path, mocks) { return evaluate(source(path), mocks); }
function dictionary(path, name = "copy") {
  const text = source(path);
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find((item) => ts.isIdentifier(item.name) && item.name.text === name);
  assert.ok(declaration?.initializer, `${path}: ${name} is defined`);
  return evaluate(`export const auditCopy = ${declaration.initializer.getText(ast)};`).auditCopy;
}
function parity(copies) {
  assert.deepEqual(Object.keys(copies).sort(), [...locales].sort());
  const keys = Object.keys(copies.it).sort();
  for (const locale of locales) {
    assert.deepEqual(Object.keys(copies[locale]).sort(), keys, `${locale}: same UI messages as Italian`);
    for (const [key, value] of Object.entries(copies[locale])) {
      for (const text of Array.isArray(value) ? value : [value]) {
        assert.equal(typeof text, "string", `${locale}.${key}: text`);
        assert.ok(text.trim(), `${locale}.${key}: not empty`);
        if (locale !== "it" && typeof copies.it[key] === "string" && text.length > 30) assert.notEqual(text, copies.it[key], `${locale}.${key}: no untranslated Italian sentence`);
      }
    }
  }
}
const checkout = load("components/meraki/checkout-copy.ts");
const wallet = load("components/meraki/wallet-copy.ts");
const discounts = load("components/meraki/discount-copy.ts");
const views = load("lib/tickets/view-copy.ts");

for (const path of ["app-shell", "profile", "event-feed", "event-poster", "event-price-summary", "event-logistics-section", "email-preferences"]) {
  test(`${path}: complete IT/EN/DE/ES labels with no Italian sentence fallback`, () => parity(dictionary(`components/meraki/${path}.tsx`)));
}
test("checkout, wallet, ticket and payment messages have matching complete locale coverage", () => {
  parity(Object.fromEntries(locales.map((locale) => [locale, checkout.checkoutCopy(locale)])));
  parity(Object.fromEntries(locales.map((locale) => [locale, wallet.walletCopy(locale)])));
  parity(views.ticketViewCopy);
  parity(views.paymentViewCopy);
  parity(dictionary("components/meraki/checkout-copy.ts", "failureCopy"));
  parity(dictionary("components/meraki/event-logistics-section.tsx", "connectionCopy"));
  parity(dictionary("lib/events/travel-link.ts", "eventTravelCopy"));
});
test("all documented checkout failure codes retain translated actionable messages", () => {
  const codes = ["sold_out", "sales_closed", "event_unavailable", "invalid_config", "no_active_price", "commerce_unavailable", "invalid_price", "pricing_unavailable", "invalid_selection", "invalid_package", "invalid_menu", "invalid_addon", "invalid_participants", "invalid_attendees", "invalid_upgrade", "upgrade_unavailable", "checkout_pending", "upgrade_pending", "upgrade_in_progress", "email_mismatch", "request_expired", "invalid_request", "request_conflict", "no_change", "advanced_checkout_required", "discount_upgrade_unsupported", "affiliate_unavailable", "price_changed"];
  for (const locale of locales) for (const code of codes) {
    const message = checkout.checkoutFailureCopy(code, locale);
    assert.ok(message?.trim(), `${locale}/${code}`);
    if (locale !== "it") assert.notEqual(message, checkout.checkoutFailureCopy(code, "it"), `${locale}/${code}: no Italian fallback`);
  }
  assert.equal(checkout.checkoutFailureCopy("unknown_internal_code", "es"), null);
  assert.equal(checkout.checkoutFailureCopy(null, "de"), null);
});
test("discount aliases are localized and all currencies keep the required Italian format", () => {
  for (const locale of locales) {
    const copy = discounts.discountCopy(locale);
    for (const [code, expected] of [["discount_inactive", copy.unavailable], ["discount_expired", copy.unavailable], ["discount_limit", copy.exhausted], ["discount_minimum", copy.minimum], ["discount_price_too_low", copy.paymentMinimum]]) assert.equal(discounts.discountError(code, locale), expected);
    assert.ok(copy.paymentMinimum.includes("0,50 €"));
    assert.doesNotMatch(copy.paymentMinimum, /€0\.50/);
  }
});

const payment = load("app/[locale]/(public)/pagamento/page.tsx", { "./payment-status": {} });
const tickets = load("app/[locale]/(public)/biglietti/page.tsx", { "@/components/meraki/ticket-wallet": {}, "@/components/meraki/wallet-copy": wallet });
const preferences = load("app/[locale]/(public)/profilo/preferenze/page.tsx", { "@/components/meraki/email-preferences": {} });
for (const [locale, ticketTitle, walletTitle, preferenceTitle] of [
  ["it", "Il tuo biglietto", "I miei biglietti", "Preferenze email"],
  ["en", "Your ticket", "My tickets", "Email preferences"],
  ["de", "Dein Ticket", "Meine Tickets", "E-Mail-Einstellungen"],
  ["es", "Tu entrada", "Mis entradas", "Preferencias de email"],
]) test(`${locale}: private ticket/payment/preference metadata stays localized and unindexed`, async () => {
  for (const [mod, title] of [[payment, ticketTitle], [tickets, walletTitle], [preferences, preferenceTitle]]) {
    const metadata = await mod.generateMetadata({ params: Promise.resolve({ locale }) });
    assert.ok(metadata.title.startsWith(title));
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, false);
    assert.equal(metadata.referrer, "no-referrer");
  }
});
for (const route of ["eventi", "workshop"]) test(`${route}: missing event metadata includes Spanish instead of falling back to Italian`, async () => {
  const chain = { from() { return this; }, select() { return this; }, eq() { return this; }, in() { return this; }, async single() { return { data: null }; } };
  const page = load(`app/[locale]/(public)/${route}/[slug]/page.tsx`, {
    "next/navigation": {}, "@/lib/supabase/server": { createClient: async () => chain }, "@/lib/i18n-utils": {},
    "@/components/meraki/event-detail": {}, "@/components/meraki/events-data": {}, "@/lib/events/logistics": {}, "@/lib/events/affiliates": {}, "@/lib/rich-text": {},
    "@/lib/events/social-data": { getSocialEvent: async () => null }, "@/lib/events/social-metadata": {},
    "@/lib/commerce/config": {},
  });
  assert.equal((await page.generateMetadata({ params: Promise.resolve({ locale: "es", slug: "missing" }) })).title, "Evento no encontrado");
});
test("event loading announces all four supported languages with explicit language metadata", () => {
  const { EventLoading } = load("components/meraki/event-loading.tsx");
  const dom = new JSDOM(renderToStaticMarkup(React.createElement(EventLoading)));
  const names = { it: "Caricamento", en: "Loading", de: "Wird geladen", es: "Cargando" };
  for (const locale of locales) assert.equal(dom.window.document.querySelector(`[role="status"] [lang="${locale}"]`).textContent, names[locale]);
  dom.window.close();
});
