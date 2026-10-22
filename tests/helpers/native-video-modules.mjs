import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../../src/lib/events/native-video.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require, URL, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://meraki-test.supabase.co" } } });
export const nativeVideoModule = compiled.exports;
export const nativeVideoFixtureUrl = "https://meraki-test.supabase.co/storage/v1/object/public/public-assets/event-videos/vibra-example.mp4";
