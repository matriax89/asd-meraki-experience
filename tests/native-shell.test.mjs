import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTs(path, customRequire = require) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: customRequire });
  return compiledModule.exports;
}

const routes = loadTs("../src/lib/meraki-routes.ts");
let pathname = "/it/eventi";
let locale = "it";
const { MerakiAppShell } = loadTs("../src/components/meraki/app-shell.tsx", (id) => {
  if (id === "next-intl") return { useLocale: () => locale };
  if (id === "next/navigation") return { usePathname: () => pathname };
  if (id === "@/lib/meraki-routes") return routes;
  if (id === "@/i18n/routing") return { Link: ({ children, ...props }) => createElement("a", props, children) };
  if (id.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return require(id);
});
const renderShell = () => renderToStaticMarkup(createElement(MerakiAppShell, {}, createElement("h1", {}, "Test")));

test("app surface covers every ticket flow and leaves marketing and admin surfaces intact", () => {
  for (const lang of ["", "/it", "/en", "/de"]) {
    for (const route of ["/eventi", "/eventi/outing", "/workshop", "/workshop/yoga", "/biglietto/id", "/pagamento", "/biglietti", "/profilo"]) {
      assert.equal(routes.isMerakiRoute(`${lang}${route}`), true, `${lang}${route}`);
    }
  }
  for (const route of [null, "/", "/it", "/it/contatti", "/admin/eventi", "/it/admin/biglietti", "/eventi-altro", "/fr/eventi"]) {
    assert.equal(routes.isMerakiRoute(route), false, String(route));
  }
});

test("ticket detail has a safe wallet return and one named main landmark", () => {
  pathname = "/it/biglietto/a-ticket";
  locale = "it";
  const html = renderShell();
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.match(html, /<main id="meraki-content"/);
  assert.match(html, /href="\/biglietti"[^>]+aria-label="Indietro"/);
  assert.match(html, /href="\/biglietti"[^>]+aria-current="page"/);
  assert.doesNotMatch(html, /href="\/eventi"[^>]+aria-current="page"/);
});

test("discovery details and checkout stay in discovery with a fixed events return", () => {
  for (const path of ["/it/eventi/yoga", "/en/workshop/yoga", "/de/pagamento"]) {
    const state = routes.getMerakiRouteState(path);
    assert.equal(state.active, "discover");
    assert.equal(state.backHref, "/eventi");
    assert.equal(state.isDetail, true);
  }
});

test("profile navigation localizes and selects the profile destination", () => {
  pathname = "/de/profilo";
  locale = "de";
  const html = renderShell();
  assert.match(html, /aria-label="Meraki-Navigation"/);
  assert.match(html, /href="\/profilo"[^>]+aria-current="page"/);
  assert.match(html, />Entdecken<\/span>/);
  assert.match(html, />Du<\/span>/);
  assert.doesNotMatch(html, /aria-label="Zurück"/);
});
