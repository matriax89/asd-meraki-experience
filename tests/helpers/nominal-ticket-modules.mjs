import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, modules = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: name => name in modules ? modules[name] : require(name) });
  return compiled.exports;
}

export const nominalCopyModule = compile("lib/tickets/nominal-copy.ts");
export const ticketPolicyModule = compile("components/meraki/ticket-policy-notice.tsx", { "@/lib/tickets/nominal-copy": nominalCopyModule });
export const nominalTicketModules = {
  "@/lib/tickets/nominal-copy": nominalCopyModule,
  "@/components/meraki/ticket-policy-notice": ticketPolicyModule,
  "./ticket-policy-notice": ticketPolicyModule,
};
