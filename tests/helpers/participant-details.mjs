import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
export function participantDetailsModule(window, fetcher = (...args) => globalThis.fetch(...args)) {
  const code = ts.transpileModule(readFileSync(new URL("../../src/components/admin/participant-details-button.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, window, document: window.document, fetch: fetcher, URLSearchParams, AbortController, Error, console, require: name => name.endsWith(".module.css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } : require(name) });
  return compiled.exports;
}
