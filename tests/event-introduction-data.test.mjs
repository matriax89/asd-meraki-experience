import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, imports = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(output, { module: compiledModule, exports: compiledModule.exports, require: (name) => imports[name] || require(name) });
  return compiledModule.exports;
}
const localization = load("lib/i18n-utils.ts");
const richText = load("lib/rich-text.ts");
const intro = load("lib/events/intro.ts", { "@/lib/rich-text": richText });
const { toMerakiEvent } = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": localization, "@/lib/events/intro": intro });
const row = { id: "fixture", slug: "vibra", tipo: "evento", titolo: { it: "VIBRA" }, sottotitolo: null, data_inizio: "2026-12-19T11:30:00Z", data_fine: null, copertina_url: null, location: "Laives", indirizzo: null, prezzo_cents: null, capacity: null, posti_venduti: 0 };

test("an event introduction is selected on the server without sending other translations to the card", () => {
  const introductions = { it: "<p>Un giorno.</p>", en: "<p>One day.</p>", de: "<p>Ein Tag.</p>", es: "<p>Un día.</p>" };
  for (const locale of ["it", "en", "de", "es"]) {
    const event = toMerakiEvent({ ...row, descrizione_breve: introductions }, locale);
    assert.equal(event.shortDescription, introductions[locale]);
    assert.equal(typeof event.shortDescription, "string");
    assert.equal(JSON.stringify(event).includes(introductions[locale === "it" ? "en" : "it"]), false);
  }
});

test("legacy events remain empty and a missing translation uses the existing Italian fallback", () => {
  for (const value of [undefined, null, ""]) assert.equal(toMerakiEvent({ ...row, descrizione_breve: value }, "en").shortDescription, "");
  assert.equal(toMerakiEvent({ ...row, descrizione_breve: { it: "<p>Presentazione.</p>", en: "" } }, "en").shortDescription, "<p>Presentazione.</p>");
});

test("introductory rich text is sanitized before the client event object is constructed", () => {
  const event = toMerakiEvent({ ...row, descrizione_breve: { en: '<p onclick="alert(1)">One <strong>day</strong>.</p><script>alert(2)</script><a href="javascript:alert(3)">More</a>' } }, "en");
  assert.match(event.shortDescription, /One <strong>day<\/strong>/);
  assert.doesNotMatch(event.shortDescription, /onclick|<script|javascript:|alert/);
});
