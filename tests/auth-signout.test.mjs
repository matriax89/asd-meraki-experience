import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const site = "https://www.merakiexperience.org";

function handler(options = {}) {
  const calls = [];
  let clients = 0;
  const source = readFileSync(new URL("../src/app/auth/signout/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  const mocks = {
    "next/headers": { async cookies() {
      return { get(name) { assert.equal(name, "NEXT_LOCALE"); return options.cookieLocale ? { value: options.cookieLocale } : undefined; } };
    } },
    "@/lib/supabase/server": { async createClient() {
      clients++;
      if (options.clientThrows) throw new Error("Private configuration detail");
      return { auth: { async signOut(value) {
        calls.push(value);
        if (options.signOutThrows) throw new Error("Private auth failure");
        return { error: options.signOutError ? { message: "Private provider error", status: 500 } : null };
      } } };
    } },
  };
  vm.runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports, URL,
    require: (id) => mocks[id] || require(id),
  });
  return {
    route: compiledModule.exports, calls, clients: () => clients,
    post(headers = {}, suffix = "") {
      return compiledModule.exports.POST(new Request(`${site}/auth/signout${suffix}`, {
        method: "POST", headers: { Origin: site, ...headers },
      }));
    },
  };
}

test("staff logout signs out only this device and redirects a form POST with 303", async () => {
  const fixture = handler();
  const response = await fixture.post({ Referer: `${site}/it/admin/biglietti`, "Sec-Fetch-Site": "same-origin" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${site}/it/eventi`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls)), [{ scope: "local" }]);
  assert.equal(fixture.clients(), 1);
  assert.equal(fixture.route.GET, undefined, "GET requests have no mutating handler");
});

for (const locale of ["it", "en", "de", "es"]) {
  test(`logout preserves the same-origin ${locale} page language ahead of the cookie`, async () => {
    const fixture = handler({ cookieLocale: "it" });
    const response = await fixture.post({ Referer: `${site}/${locale}/admin?next=https://evil.example/` });
    assert.equal(response.headers.get("location"), `${site}/${locale}/eventi`);
  });
}

for (const [locale, expected] of [["en", "en"], ["de", "de"], ["es", "es"], [undefined, "it"], ["fr", "it"], ["//evil.example", "it"], ["es/../../admin", "it"]]) {
  test(`logout validates locale cookie ${String(locale)} when the referrer provides no supported locale`, async () => {
    const fixture = handler({ cookieLocale: locale });
    const response = await fixture.post({ Referer: `${site}/admin` }, "?next=https://evil.example&locale=de");
    assert.equal(response.headers.get("location"), `${site}/${expected}/eventi`);
    assert.equal(fixture.calls.length, 1);
  });
}

test("a same-origin referrer authorizes browsers without an Origin header", async () => {
  const fixture = handler();
  const request = new Request(`${site}/auth/signout`, { method: "POST", headers: { Referer: `${site}/de/admin`, "Sec-Fetch-Site": "same-origin" } });
  const response = await fixture.route.POST(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${site}/de/eventi`);
});

for (const [label, headers] of [
  ["foreign Origin", { Origin: "https://evil.example" }],
  ["null Origin", { Origin: "null" }],
  ["foreign referrer", { Referer: "https://evil.example/es/admin" }],
  ["cross-site fetch", { "Sec-Fetch-Site": "cross-site" }],
  ["sibling-origin fetch", { "Sec-Fetch-Site": "same-site" }],
]) {
  test(`${label} cannot terminate a staff session`, async () => {
    const fixture = handler();
    const response = await fixture.post(headers);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(fixture.clients(), 0);
    assert.equal(fixture.calls.length, 0);
  });
}

test("requests without same-origin provenance cannot terminate a session", async () => {
  for (const headers of [{}, { Referer: "not-a-url" }, { Referer: "https://evil.example/it/admin" }]) {
    const fixture = handler();
    const response = await fixture.route.POST(new Request(`${site}/auth/signout`, { method: "POST", headers }));
    assert.equal(response.status, 403);
    assert.equal(fixture.clients(), 0);
  }
});

for (const [label, options] of [["provider error", { signOutError: true }], ["provider exception", { signOutThrows: true }], ["connection exception", { clientThrows: true }]]) {
  test(`${label} returns a retryable failure without claiming a completed logout`, async () => {
    const fixture = handler(options);
    const response = await fixture.post();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null, "the route does not clear session cookies itself on failure");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(body, { error: "Disconnessione non riuscita. Riprova." });
    assert.equal(JSON.stringify(body).includes("Private"), false);
  });
}
