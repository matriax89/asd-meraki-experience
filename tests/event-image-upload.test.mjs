import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => name in mocks ? mocks[name] : require(name), File, FormData, Buffer, crypto, console: { error() {} } });
  return module.exports;
}
const images = load("src/lib/uploads/images.ts");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function fixture({ authorized = true } = {}) {
  const calls = [];
  const storage = { from(bucket) { return { async upload(path, bytes, options) { calls.push({ bucket, path, bytes, options }); return { error: null }; }, getPublicUrl(path) { return { data: { publicUrl: `https://storage.example/public-assets/${path}` } }; } }; } };
  const action = load("src/app/api/admin/upload/actions.ts", { "@/lib/uploads/images": images, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => { if (!authorized) throw Error("private access detail"); return { storage }; } } });
  return { calls, action };
}
function payload(bytes = png, { type = "image/png", name = "locandina.png", folder = "events" } = {}) {
  const form = new FormData(); form.set("file", new File([bytes], name, { type })); form.set("folder", folder); return form;
}

test("event image upload authorizes staff before writing to public storage", async () => {
  const f = fixture({ authorized: false });
  const result = await f.action.uploadImageAction(payload());
  assert.equal(result.success, false); assert.equal(f.calls.length, 0);
  assert.equal(result.error.includes("private access detail"), false);
});
test("poster uploads retain the original image bytes with a generated safe extension", async () => {
  const f = fixture(); const result = await f.action.uploadImageAction(payload(png, { name: "original.svg" }));
  assert.equal(result.success, true); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].bucket, "public-assets");
  assert.match(f.calls[0].path, /^events\/[0-9a-f-]+\.png$/);
  assert.deepEqual(f.calls[0].bytes, png);
  assert.equal(f.calls[0].options.contentType, "image/png");
  assert.equal(f.calls[0].options.upsert, false);
});
test("uploads reject oversized files, disguised HTML, mismatched MIME and traversal paths", async () => {
  const f = fixture();
  for (const form of [payload(Buffer.alloc(images.MAX_IMAGE_BYTES + 1)), payload(Buffer.from('<svg onload="alert(1)"/>')), payload(png, { type: "image/jpeg" }), payload(png, { folder: "../events" })]) {
    assert.equal((await f.action.uploadImageAction(form)).success, false);
  }
  assert.equal(f.calls.length, 0);
});
