import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/public/event-description.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require });
const render = (description) => renderToStaticMarkup(createElement(compiledModule.exports.EventDescription, { description }));

test("plain event copy keeps readable paragraphs and escapes markup-like text", () => {
  const html = render("Una serata insieme\nPorta acqua & amici");
  assert.match(html, /<p>Una serata insieme<\/p>/);
  assert.match(html, /<p>Porta acqua &amp; amici<\/p>/);
});

test("existing rich event descriptions retain paragraphs, emphasis and lists", () => {
  const html = render("<p>Vieni a <strong>Meraki</strong>!</p><ul><li>Acqua</li><li>Scarpe comode</li></ul>");
  assert.match(html, /<p>Vieni a <strong>Meraki<\/strong>!<\/p>/);
  assert.match(html, /<ul><li>Acqua<\/li><li>Scarpe comode<\/li><\/ul>/);
  assert.doesNotMatch(html, /&lt;p&gt;/);
});

test("uploaded HTML cannot execute scripts, event attributes or javascript links", () => {
  const html = render('<script>alert(1)</script><p onclick="alert(2)">Evento</p><a href="javascript:alert(3)">Prenota</a><iframe src="https://evil.example"></iframe><img src=x onerror="alert(4)">');
  assert.match(html, /<p>Evento<\/p>/);
  assert.doesNotMatch(html, /<script|onclick|onerror|javascript:|<iframe|<img|alert\(/);
});
