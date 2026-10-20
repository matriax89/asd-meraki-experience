import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
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
class FixedDate extends Date { static now() { return Date.parse("2026-10-19T12:00:00Z"); } }
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Date: FixedDate, Intl, require: (name) => name in mocks ? mocks[name] : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : require(name) });
  return compiledModule.exports;
}
const model = load("components/meraki/event-model.ts");
const i18n = load("lib/i18n-utils.ts");
const data = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": i18n });
const logistics = load("lib/events/logistics.ts");
const poster = load("components/meraki/event-poster.tsx", { "next/image": { __esModule: true, default: () => null } });
const travel = load("components/meraki/event-logistics-section.tsx", { "@/lib/events/logistics": logistics });
const checkoutCalls = [];
const { EventDetail } = load("components/meraki/event-detail.tsx", {
  "./event-model": model,
  "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  "next/image": { __esModule: true, default: () => null },
  "@/components/public/event-description": { EventDescription: ({ description }) => React.createElement("div", null, description) },
  "@/lib/tickets/event-availability": load("lib/tickets/event-availability.ts"),
  "@/app/[locale]/(public)/eventi/[slug]/checkout-button": { CheckoutButton: (props) => { checkoutCalls.push(props); return React.createElement("button", null, "Checkout"); } },
  "./commerce-purchase": { CommercePurchase: ({ fallback }) => fallback },
  "./event-poster": poster,
  "./event-logistics-section": travel,
  "@/lib/events/logistics": logistics,
});
const base = {
  id: "event", slug: "meraki-qa", type: "evento", title: "Meraki QA", subtitle: "", startsAt: "2027-08-01T08:30:00Z", endsAt: null,
  cover: null, location: "Merano", address: "Via Meraki 1", price: 1500, capacity: 30, sold: 0, description: "", ctaType: "stripe", ctaUrl: null,
};
const labels = {
  it: { opening: "Apertura check-in", start: "Inizio evento", zone: "ora italiana" },
  en: { opening: "Check-in opens", start: "Event starts", zone: "Italian time" },
  de: { opening: "Check-in öffnet", start: "Veranstaltungsbeginn", zone: "italienische Zeit" },
  es: { opening: "Apertura del check-in", start: "Inicio del evento", zone: "hora de Italia" },
};
const render = (event, locale) => JSDOM.fragment(renderToStaticMarkup(React.createElement(EventDetail, { event, locale })));

for (const [locale, text] of Object.entries(labels)) {
  test(`${locale} event, workshop and masterclass details label the previous-day check-in in Italian date and Rome time`, () => {
    for (const type of ["evento", "workshop", "masterclass"]) {
      const opening = "2027-07-31T17:30:00Z";
      const document = render({ ...base, type, checkInStartsAt: opening }, locale);
      const block = document.querySelector("[data-check-in-opening]");
      assert.ok(block);
      assert.ok(block.textContent.includes(text.opening));
      assert.ok(block.textContent.includes(text.zone));
      assert.equal(block.querySelector("time").dateTime, opening);
      assert.equal(block.querySelector("time").textContent, "31/07/2027, 19:30");
      assert.ok(document.textContent.includes(text.start));
      assert.ok(document.textContent.includes("domenica 1 agosto"));
      assert.ok(document.textContent.includes("10:30"));
      assert.doesNotMatch(block.textContent, /AM|PM|July|Juli/);
    }
  });
}

test("Rome midnight uses 00:30 and advances the calendar day independently of the page language", () => {
  for (const locale of Object.keys(labels)) {
    const document = render({ ...base, checkInStartsAt: "2027-07-31T22:30:00Z" }, locale);
    assert.equal(document.querySelector("[data-check-in-opening] time").textContent, "01/08/2027, 00:30");
  }
});

test("a missing or invalid opening never invents a check-in time from the event start", () => {
  for (const checkInStartsAt of [undefined, null, "", "invalid"]) {
    const document = render({ ...base, checkInStartsAt }, "it");
    assert.equal(document.querySelector("[data-check-in-opening]"), null);
    assert.ok(document.textContent.includes("Inizio evento"));
    assert.equal(document.textContent.includes("Apertura check-in"), false);
  }
});

test("the server mapping preserves the organizer's exact opening instant and accepts old rows without it", () => {
  const row = { id: "event", slug: "event", tipo: "evento", titolo: "Meraki", sottotitolo: null, data_inizio: base.startsAt, data_fine: null, copertina_url: null, location: null, indirizzo: null, prezzo_cents: 1500, capacity: 30, posti_venduti: 0 };
  const opening = "2026-10-25T01:15:37.123Z";
  assert.equal(data.toMerakiEvent({ ...row, check_in_starts_at: opening }, "de").checkInStartsAt, opening);
  assert.equal(data.toMerakiEvent(row, "it").checkInStartsAt, null);
  assert.equal(data.toMerakiEvent({ ...row, check_in_starts_at: null }, "es").checkInStartsAt, null);
  assert.equal(data.eventFeedColumns.includes("check_in_starts_at"), false, "catalogue cards do not need the detail-only opening column");
});

test("single-price checkout receives the event's public affiliate choices without requiring them", () => {
  const affiliates = [{ id: "10000000-0000-4000-8000-000000000001", name: "Referente Meraki" }];
  render({ ...base, affiliates }, "it");
  assert.equal(checkoutCalls.at(-1).eventId, base.id);
  assert.deepEqual(checkoutCalls.at(-1).affiliates, affiliates);
  render(base, "it");
  assert.equal(checkoutCalls.at(-1).affiliates, undefined);
});
