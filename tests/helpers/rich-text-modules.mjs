import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, URL, require: (name) => name in mocks ? mocks[name] : require(name) });
  return compiledModule.exports;
}
export const richText = load("lib/rich-text.ts");
export const eventDescription = load("components/public/event-description.tsx", { "@/lib/rich-text": richText });
