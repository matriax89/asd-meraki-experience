import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import ts from "typescript";
const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.merakiexperience.org/it/login", pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
const source = readFileSync(new URL("../src/app/[locale]/(public)/login/page.tsx", import.meta.url), "utf8");
function load(locale, calls, navigations) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, window: dom.window, document: dom.window.document, process: { env: {} }, console, require: name => {
    if (name === "next/navigation") return { useRouter: () => ({ replace: url => navigations.push(url), refresh() {} }) };
    if (name === "next-intl") return { useLocale: () => locale, useTranslations: () => key => key };
    if (name === "@supabase/ssr") return { createBrowserClient: () => ({ auth: { signInWithOtp: async value => { calls.push({ kind: "request", value }); return { error: null }; }, verifyOtp: async value => { calls.push({ kind: "verify", value }); return { data: { session: { user: { id: "staff-local-only" } } }, error: null }; } } }) };
    return require(name);
  } });
  return exports.default;
}
async function fill(input, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
for (const locale of ["it", "en", "de", "es"]) test(`${locale}: staff OTP email receives a same-origin locale without signup or metadata changes`, async context => {
  const calls = []; const navigations = [];
  dom.window.history.replaceState({}, "", `/${locale}/login`);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const Login = load(locale, calls, navigations);
  await act(async () => root.render(React.createElement(Login)));
  await fill(host.querySelector("input[type=email]"), "STAFF@example.test");
  await act(async () => host.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { kind: "request", value: { email: "staff@example.test", options: { shouldCreateUser: false, emailRedirectTo: `https://www.merakiexperience.org/${locale}/admin` } } });
  assert.equal(calls.length, 1);
  const code = host.querySelector("#login-code"); assert.ok(code); assert.equal(code.autocomplete, "one-time-code");
  await fill(code, "123456");
  await act(async () => host.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), { kind: "verify", value: { email: "staff@example.test", token: "123456", type: "email" } });
  assert.deepEqual(navigations, [`/${locale}/admin`]);
});
test("OTP template preserves one native token, four locale branches, original logo and no login links or tracking", () => {
  const template = readFileSync(new URL("../supabase/templates/magic-link.html", import.meta.url), "utf8");
  assert.equal((template.match(/{{\s*\.Token\s*}}/g) || []).length, 1);
  assert.equal(/ConfirmationURL|TokenHash|\.Data|<script|<form|<a\s/i.test(template), false);
  for (const locale of ["en", "de", "es"]) {
    assert.ok(template.includes(`https://www.merakiexperience.org/${locale}/admin`));
    assert.ok(template.includes(`https://merakiexperience.org/${locale}/admin`));
    assert.ok(template.includes(`printf "%s/${locale}/admin" .SiteURL`));
  }
  assert.ok(template.includes('$language := "it"'));
  for (const title of ["Il tuo codice di accesso", "Your access code", "Dein Zugangscode", "Tu código de acceso"]) assert.ok(template.includes(title));
  assert.ok(template.includes('src="https://www.merakiexperience.org/images/logo-meraki-email.png"'));
  const subject = readFileSync(new URL("../supabase/templates/magic-link-subject.txt", import.meta.url), "utf8").trim();
  assert.equal(subject.split("\n").length, 1);
  assert.ok(subject.length <= 255, "Hosted Supabase must be able to persist the whole localized subject");
  assert.ok(subject.startsWith("Meraki: "));
  for (const title of ["Codice", "Access code", "Zugangscode", "Código"]) assert.ok(subject.includes(title));
  for (const locale of ["en", "de", "es"]) assert.ok(subject.includes(`https://www.merakiexperience.org/${locale}/admin`));
  assert.equal(/\.Token|\.Data/.test(subject), false, "The subject never reveals the OTP or account metadata");
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.ok(config.includes("subject = '" + subject + "'"));
  assert.ok(config.includes('content_path = "./supabase/templates/magic-link.html"'));
  for (const locale of ["it", "en", "de", "es"]) assert.ok(config.includes(`http://127.0.0.1:3000/${locale}/admin`));
});
