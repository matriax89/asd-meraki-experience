import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { dateFormatModule } from "./helpers/date-format-modules.mjs";
import { eventIntroModule } from "./helpers/event-intro-modules.mjs";

const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => imports[id] || require(id) });
  return compiledModule.exports;
}
const model = load("components/meraki/event-model.ts", { "@/lib/events/date-format": dateFormatModule });
const data = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": load("lib/i18n-utils.ts"), "@/lib/events/intro": eventIntroModule });
const { MerakiEventCard } = load("components/meraki/event-card.tsx", {
  "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
  "./event-model": model,
  "./event-poster": { EventPoster: () => React.createElement("div", { "data-poster": true }) },
});
const descriptions = {
  it: "<p><strong>VIBRA — One Day Experience</strong></p><p>Un’esperienza che ti rimane dentro.</p><p><em>— Alejandro Angulo</em></p>",
  en: "<p><strong>VIBRA — One Day Experience</strong></p><p>An experience that stays with you.</p><p><em>— Alejandro Angulo</em></p>",
  de: "<p><strong>VIBRA — One Day Experience</strong></p><p>Ein Erlebnis, das in dir nachklingt.</p><p><em>— Alejandro Angulo</em></p>",
  es: "<p><strong>VIBRA — One Day Experience</strong></p><p>Una experiencia que se queda dentro de ti.</p><p><em>— Alejandro Angulo</em></p>",
};
const row = { id: "event", slug: "vibra", tipo: "evento", titolo: { it: "Vibra" }, sottotitolo: null, descrizione_breve: descriptions, data_inizio: "2026-12-19T11:30:00Z", data_fine: null, copertina_url: null, location: "Black Box", indirizzo: null, prezzo_cents: 3500, capacity: 100, posti_venduti: 0 };
const render = (event, locale = "it") => JSDOM.fragment(renderToStaticMarkup(React.createElement(MerakiEventCard, { event, locale, now: Date.parse("2026-10-21T10:00:00Z"), featured: true })));

for (const [locale, description] of Object.entries(descriptions)) test(`${locale}: the localized introduction precedes the purchase action with paragraphs, formatting and attribution`, () => {
  const event = data.toMerakiEvent(row, locale);
  const document = render(event, locale);
  const intro = document.querySelector("[data-event-introduction]");
  const purchase = document.querySelector("[data-event-purchase-cta]");
  assert.ok(intro);
  assert.equal(intro.innerHTML, description);
  assert.equal(intro.querySelectorAll("p").length, 3);
  assert.equal(intro.querySelector("strong").textContent, "VIBRA — One Day Experience");
  assert.equal(intro.querySelector("em").textContent, "— Alejandro Angulo");
  assert.ok(intro.compareDocumentPosition(purchase) & 4, "the quote is read before buying");
  assert.equal(purchase.getAttribute("href"), "/eventi/vibra#top");
  if (locale !== "it") assert.ok(!intro.textContent.includes("Un’esperienza che ti rimane dentro"));
});

test("empty and legacy events do not gain blank text blocks", () => {
  for (const value of [undefined, null, {}, { it: "<p><br></p>" }]) {
    assert.equal(render(data.toMerakiEvent({ ...row, descrizione_breve: value }, "it")).querySelector("[data-event-introduction]"), null);
  }
});

test("intro HTML is sanitized on the server before the client card renders it", () => {
  const event = data.toMerakiEvent({ ...row, descrizione_breve: { it: '<p onclick="alert(1)">Hello <strong>VIBRA</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Bad link</a><a href="https://example.test">Info</a>' } }, "it");
  const intro = render(event).querySelector("[data-event-introduction]");
  assert.equal(intro.querySelector("script,img,[onclick],[onerror]"), null);
  assert.equal(intro.querySelectorAll("a")[0].hasAttribute("href"), false);
  assert.equal(intro.querySelectorAll("a")[1].getAttribute("rel"), "nofollow noopener noreferrer");
  assert.equal(intro.querySelector("strong").textContent, "VIBRA");
});
