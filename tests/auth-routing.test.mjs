import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import nextTesting from "next/experimental/testing/server.js";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { unstable_doesMiddlewareMatch: doesProxyMatch } = nextTesting;
const source = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => {
  if (id === "next-intl/middleware") return { __esModule: true, default: () => () => null };
  if (id === "./i18n/routing") return { routing: { locales: ["it", "en", "de", "es"], defaultLocale: "it" } };
  return require(id);
} });

test("logout form reaches its route without an i18n redirect", () => {
  for (const url of ["/auth/signout", "/auth/signout/", "/auth/signout?next=/de/admin"]) {
    assert.equal(doesProxyMatch({ config: compiledModule.exports.config, nextConfig: {}, url }), false, url);
  }
});

test("public localization and staff page authentication keep proxy coverage", () => {
  for (const url of ["/it/eventi", "/en/biglietti", "/de/profilo", "/es/login", "/it/admin/biglietti", "/auth/signout-extra"]) {
    assert.equal(doesProxyMatch({ config: compiledModule.exports.config, nextConfig: {}, url }), true, url);
  }
});
