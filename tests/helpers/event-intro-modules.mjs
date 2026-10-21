import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relative, imports = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../../src/${relative}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => imports[id] || require(id) });
  return compiledModule.exports;
}
export const eventIntroModule = load("lib/events/intro.ts", { "@/lib/rich-text": load("lib/rich-text.ts") });
