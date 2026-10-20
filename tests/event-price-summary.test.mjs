import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Intl, require: (name) => mocks[name] || require(name) });
  return exports;
}
const { EventPriceSummary } = load("components/meraki/event-price-summary.tsx", {
  "./event-model": load("components/meraki/event-model.ts"),
  "./commerce-public-model": load("components/meraki/commerce-public-model.ts"),
  "@/lib/commerce/localization": load("lib/commerce/localization.ts"),
});
const now = Date.parse("2026-10-20T15:00:00Z");
const earlyEnd = "2026-12-04T22:59:00Z";
const nextStart = "2026-12-04T23:00:00Z";
const tier = (id, label, amountCents, startsAt = null, endsAt = null) => ({ id, label, amountCents, startsAt, endsAt });
const offer = (id, name, early, next) => ({
  id, name, salesCloseAt: null,
  prices: [tier("early", "Early Bird", early, null, earlyEnd), tier("standard", "Standard", next, nextStart)],
});
const packages = [offer("ws", "Workshop", 4500, 5500), offer("mc", "Masterclass", 3500, 4500), offer("bundle", "Workshop + Masterclass", 6500, 8500)];
function render(props = {}) {
  return new JSDOM(renderToStaticMarkup(React.createElement(EventPriceSummary, { packages, locale: "it", now, ...props }))).window.document;
}
const row = (document, id) => document.querySelector(`[data-event-package-price="${id}"]`);
const plain = (element) => element.textContent.replace(/\s+/g, " ").trim();

test("event card exposes all current package prices with next-price savings and one clear shared deadline", () => {
  const document = render();
  assert.equal(document.querySelectorAll("[data-event-package-price]").length, 3);
  for (const [id, name, current, next, percent] of [["ws", "Workshop", "45 €", "55 €", "18,1"], ["mc", "Masterclass", "35 €", "45 €", "22,2"], ["bundle", "Workshop + Masterclass", "65 €", "85 €", "23,5"]]) {
    const packageRow = row(document, id);
    assert.ok(plain(packageRow).includes(name));
    assert.equal(plain(packageRow.querySelector("strong")), current);
    assert.equal(plain(packageRow.querySelector("[data-price-tier]")), "Early Bird");
    assert.equal(plain(packageRow.querySelector("[data-price-saving]")), `−${percent}% rispetto al prossimo prezzo`);
    assert.ok(plain(packageRow.querySelector("[data-next-price]")).includes(`Prossimo prezzo: ${next}`));
    assert.ok(plain(packageRow.querySelector("[data-next-price]")).includes("05/12/2026, 00:00"));
  }
  assert.equal(document.querySelectorAll("[data-price-deadline]").length, 1);
  assert.ok(plain(document.querySelector("[data-price-deadline]")).includes("04/12/2026, 23:59"));
  assert.match(plain(document.body), /Prezzi a persona · Ora italiana \(Europe\/Rome\)/);
  assert.equal(document.querySelector("del,s"), null, "a future price must not masquerade as an old price");
});

test("different package deadlines remain attached to their own price", () => {
  const altered = structuredClone(packages);
  altered[1].prices[0].endsAt = "2026-12-03T22:59:00Z";
  const document = render({ packages: altered });
  assert.equal(document.querySelectorAll("[data-price-deadline]").length, 3);
  assert.ok(plain(row(document, "mc").querySelector("[data-price-deadline]")).includes("03/12/2026, 23:59"));
  assert.ok(plain(row(document, "ws").querySelector("[data-price-deadline]")).includes("04/12/2026, 23:59"));
});

test("the exact end of a tier removes its old price and the next start shows the new price", () => {
  assert.equal(render({ now: Date.parse(earlyEnd) }).querySelector("[data-event-price-summary]"), null, "the configured one-minute sales gap has no active price");
  const document = render({ now: Date.parse(nextStart) });
  assert.equal(plain(row(document, "ws").querySelector("strong")), "55 €");
  assert.equal(plain(row(document, "bundle").querySelector("strong")), "85 €");
  assert.equal(plain(row(document, "ws").querySelector("[data-price-tier]")), "Standard");
  assert.equal(document.querySelector("[data-price-saving],[data-next-price]"), null);
  assert.doesNotMatch(plain(document.body), /Early Bird/);
});

test("equal or cheaper immediate successors cannot advertise a discount or skip to a later increase", () => {
  for (const next of [4500, 3500, 0]) {
    const packageOffer = offer("ws", "Workshop", 4500, next);
    packageOffer.prices[1].endsAt = "2026-12-10T23:00:00Z";
    packageOffer.prices.push(tier("later", "Last minute", 8500, "2026-12-10T23:00:00Z"));
    const document = render({ packages: [packageOffer] });
    assert.equal(document.querySelector("[data-price-saving]"), null);
    assert.ok(plain(document.querySelector("[data-next-price]")).includes(next ? `${next / 100} €` : "Gratis"));
    assert.doesNotMatch(plain(document.querySelector("[data-next-price]")), /85 €/);
  }
});

test("a single current price and missing or invalid current tiers never manufacture savings", () => {
  const document = render({ packages: [{ id: "single", name: "Workshop", salesCloseAt: null, prices: [tier("single", "Prezzo unico", 4500)] }] });
  assert.ok(plain(document.body).includes("45 €"));
  assert.equal(document.querySelector("[data-price-saving],[data-next-price],[data-price-deadline]"), null);
  for (const packageList of [[], [{ ...packages[0], prices: [] }], [{ ...packages[0], prices: [tier("future", "Standard", 4500, nextStart)] }], [{ ...packages[0], prices: [tier("invalid", "Standard", -100)] }]]) {
    assert.equal(render({ packages: packageList }).querySelector("[data-event-price-summary]"), null);
  }
  assert.equal(render({ now: NaN }).querySelector("[data-event-price-summary]"), null);
});

test("closed activity sales suppress a formula and a next price beyond sales closure cannot imply savings", () => {
  const closed = { ...packages[0], salesCloseAt: new Date(now).toISOString() };
  assert.equal(row(render({ packages: [closed] }), "ws"), null);
  const closesBeforeNext = { ...packages[0], salesCloseAt: "2026-11-20T22:00:00Z" };
  const document = render({ packages: [closesBeforeNext] });
  assert.equal(document.querySelector("[data-next-price],[data-price-saving]"), null);
  assert.ok(plain(document.querySelector("[data-price-deadline]")).includes("20/11/2026, 23:00"));
});

test("four languages localize package and tier names while retaining Italian dates, euros and decimal percentages", () => {
  const translated = { ...packages[0], nameTranslations: { en: "Workshop in English", de: "Workshop auf Deutsch", es: "Taller en español" }, prices: packages[0].prices.map((price) => ({ ...price, labelTranslations: { en: "Advance price", de: "Frühbucher", es: "Venta anticipada" } })) };
  const expected = { it: ["Formule e prezzi", "Workshop", "Early Bird", "rispetto al prossimo prezzo"], en: ["Packages and prices", "Workshop in English", "Advance price", "compared with the next price"], de: ["Pakete und Preise", "Workshop auf Deutsch", "Frühbucher", "gegenüber dem nächsten Preis"], es: ["Modalidades y precios", "Taller en español", "Venta anticipada", "respecto al próximo precio"] };
  for (const [locale, labels] of Object.entries(expected)) {
    const document = render({ locale, packages: [translated] });
    for (const label of labels) assert.ok(plain(document.body).includes(label), `${locale}: ${label}`);
    assert.ok(plain(document.body).includes("−18,1%"));
    assert.ok(plain(document.body).includes("04/12/2026, 23:59"));
    assert.equal(plain(document.querySelector("strong")), "45 €");
  }
});

test("free admission keeps its localized label and missing content translations fall back to Italian", () => {
  const free = { id: "free", name: "Fallback", nameTranslations: { it: "Ingresso gratuito", en: "   " }, salesCloseAt: null, prices: [tier("free", "Gratuito", 0)] };
  const document = render({ locale: "en", packages: [free] });
  assert.ok(plain(document.body).includes("Ingresso gratuito"));
  assert.equal(plain(document.querySelector("strong")), "Free");
});
