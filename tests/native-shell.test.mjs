import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTs(path, customRequire = require, context = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: customRequire, ...context });
  return compiledModule.exports;
}

const routes = loadTs("../src/lib/meraki-routes.ts");
let pathname = "/it/eventi";
let locale = "it";
function requireShell(id) {
  if (id === "next-intl") return { useLocale: () => locale };
  if (id === "next/navigation") return { usePathname: () => pathname };
  if (id === "@/lib/meraki-routes") return routes;
  if (id === "@/components/public/language-switcher") return { LanguageSwitcher: () => createElement("button", { type: "button", "aria-haspopup": "menu", "aria-label": "Language" }, locale.toUpperCase()) };
  if (id === "@/i18n/routing") return { Link: ({ children, ...props }) => createElement("a", props, children) };
  if (id.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return require(id);
}
const { MerakiAppShell } = loadTs("../src/components/meraki/app-shell.tsx", requireShell);
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
    assert.ok(document.querySelector('header button[aria-haspopup="menu"]'), "the language chooser stays at the top on app routes");
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
  assert.equal(new JSDOM(html).window.document.querySelector("nav"), null, "the server must not flash the installed-app dock");
});

test("discovery details and checkout stay in discovery with a fixed events return", () => {
  for (const path of ["/it/eventi/yoga", "/en/workshop/yoga", "/de/pagamento"]) {
    const state = routes.getMerakiRouteState(path);
    assert.equal(state.active, "discover");
    assert.equal(state.backHref, "/eventi");
    assert.equal(state.isDetail, true);
  }
});

test("the public browser information page keeps the header without an installed-app dock", () => {
  pathname = "/de/profilo";
  locale = "de";
  const html = renderShell();
  assert.doesNotMatch(html, /<nav\b/);
  assert.doesNotMatch(html, /class="[^"]*standalone/);
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
      assert.equal(document.querySelector("nav"), null);
    }
  }
});

const { MerakiProfile } = loadTs("../src/components/meraki/profile.tsx", (id) => {
  if (id === "next/navigation") return { usePathname: () => pathname, useRouter: () => ({ replace() {} }) };
  if (id === "@/components/pwa/install-card") return { InstallCard: () => null };
  if (id === "@/i18n/locale-choice") return { rememberLocaleChoice() {} };
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

async function mountBrowserShell(context, { standalone = false, iosStandalone = false, fullscreen = false, hydrate = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://meraki.test/it/eventi", pretendToBeVisual: true });
  const { window } = dom;
  const listeners = new Set();
  let standaloneMatches = standalone;
  window.matchMedia = (query) => ({
    matches: query === "(display-mode: standalone)" ? standaloneMatches : query === "(display-mode: fullscreen)" && fullscreen,
    media: query,
    addEventListener(event, listener) { if (event === "change") listeners.add(listener); },
    removeEventListener(event, listener) { if (event === "change") listeners.delete(listener); },
  });
  Object.defineProperty(window.navigator, "standalone", { configurable: true, value: iosStandalone });
  const descriptors = new Map();
  for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot, hydrateRoot } = await import("react-dom/client");
  const { MerakiAppShell: ClientShell } = loadTs("../src/components/meraki/app-shell.tsx", (id) => {
    if (id === "next/image") return { __esModule: true, default: ({ src, alt, width, height, className }) => createElement("img", { src, alt, width, height, className }) };
    return requireShell(id);
  }, { window, navigator: window.navigator });
  const container = window.document.getElementById("root");
  const element = () => createElement(ClientShell, {}, createElement("h1", {}, "Test"));
  const hydrationErrors = [];
  let root;
  if (hydrate) {
    container.innerHTML = renderToStaticMarkup(element());
    assert.equal(container.querySelector("nav"), null, "SSR remains dock-free before hydration");
    await act(async () => { root = hydrateRoot(container, element(), { onRecoverableError: (error) => hydrationErrors.push(error) }); });
  } else {
    root = createRoot(container);
    await act(async () => root.render(element()));
  }
  context.after(async () => {
    await act(async () => root.unmount());
    assert.equal(listeners.size, 0, "display-mode listeners must be released on unmount");
    window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    document: window.document,
    hydrationErrors,
    async setStandalone(value) {
      standaloneMatches = value;
      await act(async () => { for (const listener of listeners) listener(); });
    },
    async rerender() { await act(async () => root.render(element())); },
  };
}

test("regular mobile browsing never shows the app dock, including after hydration", async (context) => {
  pathname = "/it/eventi";
  locale = "it";
  const ui = await mountBrowserShell(context, { hydrate: true });
  assert.equal(ui.document.querySelector("nav"), null);
  assert.equal(ui.document.querySelector("[data-meraki-app]").classList.contains("standalone"), false);
  assert.deepEqual(ui.hydrationErrors, []);
  assert.ok(ui.document.querySelector('header a[aria-label="Accesso staff"]'));
});

test("installed Android display mode enables the localized dock without a hydration mismatch", async (context) => {
  pathname = "/de/profilo";
  locale = "de";
  const ui = await mountBrowserShell(context, { standalone: true, hydrate: true });
  const navigation = ui.document.querySelector('nav[aria-label="Meraki-Navigation"]');
  assert.ok(navigation);
  assert.equal(navigation.querySelector('a[href="/profilo"]').getAttribute("aria-current"), "page");
  assert.match(navigation.textContent, /Entdecken/);
  assert.ok(ui.document.querySelector("[data-meraki-app]").classList.contains("standalone"));
  assert.deepEqual(ui.hydrationErrors, []);
  for (const [lang, label] of [["it", "Navigazione Meraki"], ["en", "Meraki navigation"], ["es", "Navegación de Meraki"]]) {
    locale = lang;
    pathname = `/${lang}/biglietto/test`;
    await ui.rerender();
    const localized = ui.document.querySelector(`nav[aria-label="${label}"]`);
    assert.equal(localized.querySelector('a[href="/biglietti"]').getAttribute("aria-current"), "page");
    assert.equal(localized.querySelector('a[href="/eventi"]').hasAttribute("aria-current"), false);
  }
});

test("installed iPhone uses navigator.standalone when its display-mode query is false", async (context) => {
  pathname = "/it/eventi";
  locale = "it";
  const ui = await mountBrowserShell(context, { iosStandalone: true });
  assert.ok(ui.document.querySelector('nav[aria-label="Navigazione Meraki"]'));
  assert.ok(ui.document.querySelector("[data-meraki-app]").classList.contains("standalone"));
});

test("moving between installed-app and browser display modes updates the dock and reserved space together", async (context) => {
  pathname = "/it/eventi";
  locale = "it";
  const ui = await mountBrowserShell(context);
  for (const active of [true, false, true]) {
    await ui.setStandalone(active);
    assert.equal(Boolean(ui.document.querySelector("nav")), active);
    assert.equal(ui.document.querySelector("[data-meraki-app]").classList.contains("standalone"), active);
  }
});

test("ordinary browser fullscreen does not masquerade as an installed app", async (context) => {
  pathname = "/it/eventi";
  locale = "it";
  const ui = await mountBrowserShell(context, { fullscreen: true });
  assert.equal(ui.document.querySelector("nav"), null);
  assert.equal(ui.document.querySelector("[data-meraki-app]").classList.contains("standalone"), false);
});
