import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { NextRequest, NextResponse } from "next/server.js";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative, imports = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Intl, process, require: (id) => id in imports ? imports[id] : require(id) });
  return compiledModule.exports;
}
const choice = load("../src/i18n/locale-choice.ts");
const preference = load("../src/i18n/locale-preference.ts", { "./locale-choice": choice });
const visit = (overrides = {}) => ({ pathname: "/it/eventi/vibra-by-alejandro-angulo", method: "GET", acceptLanguage: "de-AT,de;q=0.9,en;q=0.8", ...overrides });

test("browser negotiation supports regional languages and weighted preferences", () => {
  for (const [header, expected] of [
    ["en-US,en;q=0.9,it;q=0.7", "en"], ["de-AT,de;q=0.9", "de"],
    ["es-AR,es;q=0.9,en;q=0.8", "es"], ["it-CH,it;q=0.9", "it"],
    ["it;q=0.4,de;q=0.9,en;q=0.5", "de"], ["fr-FR,it;q=0.7", "it"],
    ["de;q=0,en;q=0.7", "en"], ["FR-fr", "en"], ["ja-JP,zh;q=0.8", "en"],
    [null, "it"], ["", "it"], ["*", "it"], ["bad_tag,de;q=invalid", "it"],
  ]) assert.equal(preference.browserLocale(header), expected, String(header));
});

test("shared Italian links follow visitor language, including an old automatically written Italian cookie", () => {
  for (const previousLocale of [undefined, "it", "bad"]) {
    assert.equal(preference.publicLocaleRedirect(visit({ previousLocale })), "/de/eventi/vibra-by-alejandro-angulo");
  }
  assert.equal(preference.publicLocaleRedirect(visit({ acceptLanguage: "it" })), null);
  assert.equal(preference.publicLocaleRedirect(visit({ acceptLanguage: "fr" })), "/en/eventi/vibra-by-alejandro-angulo");
});

test("manual choices win, including Italian on foreign browsers; legacy non-Italian preferences survive", () => {
  assert.equal(preference.publicLocaleRedirect(visit({ manualLocale: "it", previousLocale: "de" })), null);
  assert.equal(preference.publicLocaleRedirect(visit({ manualLocale: "es", previousLocale: "en" })), "/es/eventi/vibra-by-alejandro-angulo");
  assert.equal(preference.publicLocaleRedirect(visit({ previousLocale: "en" })), "/en/eventi/vibra-by-alejandro-angulo");
  assert.equal(preference.publicLocaleRedirect(visit({ manualLocale: "https://untrusted.test" })), "/de/eventi/vibra-by-alejandro-angulo");
});

test("explicit translations are terminal destinations even when browser and manual language differ", () => {
  for (const locale of ["en", "de", "es"]) {
    assert.equal(preference.publicLocaleRedirect(visit({ pathname: `/${locale}/eventi`, manualLocale: "it" })), null);
  }
});

test("only known public discovery paths negotiate, using complete path segments", () => {
  for (const pathname of ["/", "/it", "/it/", "/eventi", "/it/workshop", "/it/corsi/salsa", "/it/sponsors/example", "/it/chi-siamo", "/it/contatti", "/it/legal/privacy-policy"]) {
    assert.ok(preference.publicLocaleRedirect(visit({ pathname }))?.startsWith("/de"), pathname);
  }
  for (const pathname of ["/it/admin", "/it/admin/eventi", "/it/login", "/auth/callback", "/auth/signout", "/api/event-commerce/checkout", "/it/pagamento", "/it/biglietti", "/it/biglietto/secret", "/it/ordine/123/conferma", "/it/profilo", "/it/eventi-extra", "/it/eventi/slug/admin", "/_next/image"]) {
    assert.equal(preference.publicLocaleRedirect(visit({ pathname })), null, pathname);
  }
});

test("locale negotiation never redirects mutations, server actions, RSC or prefetch traffic", () => {
  for (const overrides of [{ method: "POST" }, { method: "DELETE" }, { isServerNavigation: true }, { isPrefetch: true }]) {
    assert.equal(preference.publicLocaleRedirect(visit(overrides)), null);
  }
  assert.equal(preference.publicLocaleRedirect(visit({ method: "HEAD" })), "/de/eventi/vibra-by-alejandro-angulo");
});

test("search and social crawlers retain each explicit language for SEO and poster previews", () => {
  for (const userAgent of ["Googlebot/2.1", "bingbot/2.0", "facebookexternalhit/1.1", "WhatsApp/2.0", "TelegramBot", "Twitterbot/1.0", "LinkedInBot/1.0", "Discordbot/2.0", "Applebot"]) {
    assert.equal(preference.publicLocaleRedirect(visit({ userAgent })), null, userAgent);
  }
  assert.equal(preference.publicLocaleRedirect(visit({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 WhatsApp/2.0" })), "/de/eventi/vibra-by-alejandro-angulo");
});

function loadProxy() {
  let user = null;
  let refresh = false;
  let authCalls = 0;
  const proxy = load("../src/proxy.ts", {
    "./i18n/locale-choice": choice,
    "./i18n/locale-preference": preference,
    "./i18n/routing": { routing: { locales: ["it", "en", "de", "es"], defaultLocale: "it" } },
    "next/server": { NextResponse },
    "next-intl/middleware": { __esModule: true, default: () => () => NextResponse.next() },
    "@supabase/ssr": { createServerClient: (_url, _key, { cookies }) => ({ auth: { async getUser() {
      authCalls++;
      if (refresh) cookies.setAll([{ name: "auth-session", value: "refreshed", options: { httpOnly: true } }]);
      return { data: { user } };
    } } }) },
  }).default;
  return { proxy, authenticated: () => { user = { id: "staff" }; refresh = true; }, authCalls: () => authCalls };
}

test("document redirect keeps affiliate/campaign parameters and cannot be publicly cached", async () => {
  const state = loadProxy();
  const request = new NextRequest("https://www.merakiexperience.org/it/eventi/vibra?affiliate=martina&utm_source=whatsapp#programma", { headers: { "accept-language": "de-AT", cookie: "NEXT_LOCALE=it" } });
  const response = await state.proxy(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://www.merakiexperience.org/de/eventi/vibra?affiliate=martina&utm_source=whatsapp#programma");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Accept-Language, Cookie, User-Agent");
  assert.equal(state.authCalls(), 0);
});

test("manual Italian preference and server navigation are passed through to the existing route", async () => {
  const state = loadProxy();
  for (const headers of [
    { "accept-language": "de", cookie: "MERAKI_LOCALE_CHOICE=it" },
    { "accept-language": "de", RSC: "1" },
    { "accept-language": "de", "next-router-prefetch": "1" },
    { "accept-language": "de", "sec-purpose": "prefetch;prerender" },
  ]) {
    const response = await state.proxy(new NextRequest("https://www.merakiexperience.org/it/eventi", { headers }));
    assert.equal(response.headers.get("location"), null);
  }
  assert.equal(state.authCalls(), 4);
});

test("admin authentication and refreshed session cookies still work", async () => {
  const state = loadProxy();
  const request = new NextRequest("https://www.merakiexperience.org/it/admin/rimborsi", { headers: { "accept-language": "de" } });
  const denied = await state.proxy(request);
  assert.equal(denied.headers.get("location"), "https://www.merakiexperience.org/it/login");
  state.authenticated();
  const allowed = await state.proxy(request);
  assert.equal(allowed.headers.get("location"), null);
  assert.equal(allowed.cookies.get("auth-session")?.value, "refreshed");
  assert.equal(allowed.cookies.get("auth-session")?.httpOnly, true);
});
