import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
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
const renderShell = (props = {}) => renderToStaticMarkup(createElement(MerakiAppShell, props, createElement("h1", {}, "Test")));

test("the app header displays the original artwork and follows the site's configured logo", () => {
  pathname = "/it/eventi";
  locale = "it";
  for (const [props, expectedSource] of [
    [{}, "/images/logo-meraki-horizontal.webp"],
    [{ logoUrl: "/images/logo-meraki.png" }, "/images/logo-meraki.png"],
  ]) {
    const { document } = new JSDOM(renderShell(props)).window;
    const brand = document.querySelector('header a[aria-label="Meraki Experience"]');
    const artwork = brand?.querySelector('img[alt="Meraki Experience"]');
    assert.ok(artwork, "the home link needs a named logo image");
    assert.equal(brand.getAttribute("href"), "/eventi");
    const imageUrl = new URL(artwork.getAttribute("src"), "https://meraki.test");
    assert.equal(imageUrl.searchParams.get("url") || imageUrl.pathname, expectedSource);
    assert.ok(Number(artwork.getAttribute("width")) > 0);
    assert.ok(Number(artwork.getAttribute("height")) > 0);
  }
});

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

test("information navigation localizes and selects preferences separately from staff sign-in", () => {
  pathname = "/de/profilo";
  locale = "de";
  const html = renderShell();
  assert.match(html, /aria-label="Meraki-Navigation"/);
  assert.match(html, /href="\/profilo"[^>]+aria-current="page"/);
  assert.match(html, />Entdecken<\/span>/);
  assert.match(html, />Info<\/span>/);
  assert.doesNotMatch(html, /aria-label="Zurück"/);
});

test("the header icon opens sign-in for visitors and the roster for verified staff", () => {
  const labels = { it: ["Accesso staff", "Area staff"], en: ["Staff sign-in", "Staff area"], de: ["Team-Anmeldung", "Teambereich"], es: ["Acceso del equipo", "Área del equipo"] };
  for (const [lang, [signIn, staffArea]] of Object.entries(labels)) {
    locale = lang;
    pathname = `/${lang}/profilo`;
    for (const staffAccess of [false, true]) {
      const { document } = new JSDOM(renderShell({ staffAccess })).window;
      const access = document.querySelector(`header a[aria-label="${staffAccess ? staffArea : signIn}"]`);
      assert.equal(access?.getAttribute("href"), staffAccess ? "/admin/biglietti" : "/login");
      assert.equal(access.hasAttribute("aria-current"), false, "access is separate from the active information tab");
      assert.equal(document.querySelector('nav a[href="/profilo"]').getAttribute("aria-current"), "page");
    }
  }
});

const { MerakiProfile } = loadTs("../src/components/meraki/profile.tsx", (id) => {
  if (id === "next/navigation") return { usePathname: () => pathname, useRouter: () => ({ replace() {} }) };
  if (id === "@/components/pwa/install-card") return { InstallCard: () => null };
  if (id === "@/i18n/routing") return { Link: ({ children, ...props }) => createElement("a", props, children) };
  if (id.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return require(id);
});

test("public information explains guest tickets and shows operational tools only to verified staff", () => {
  const guestCopy = { it: "Non serve un account", en: "No account needed", de: "Kein Konto nötig", es: "No necesitas una cuenta" };
  for (const lang of ["it", "en", "de", "es"]) {
    for (const staffAccess of [undefined, false, true]) {
      const html = renderToStaticMarkup(createElement(MerakiProfile, { locale: lang, staffAccess }));
      const { document } = new JSDOM(html).window;
      assert.equal(document.querySelectorAll('a[href="/admin/biglietti"]').length, staffAccess ? 1 : 0);
      assert.ok(document.querySelector('a[href="/biglietti"]'));
      assert.match(document.body.textContent, new RegExp(guestCopy[lang]));
      assert.equal(document.querySelector('video,canvas'), null);
    }
  }
});
