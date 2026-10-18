import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: name => dependencies[name] || require(name), Error });
  return exports;
}

test("staff document retrieval checks permission on every request and allowlists its source", async () => {
  const calls = []; let permitted = false;
  const query = { select(fields) { calls.push(["select", fields]); return this; }, eq(key, id) { calls.push(["eq", key, id]); return this; }, async maybeSingle() { return { data: { document_number: "RSSMRA85T10A562S" }, error: null }; } };
  const actions = load("../src/app/api/admin/participants/actions.ts", { "@/lib/commerce/admin-auth": { async requireCommerceStaff() { calls.push(["auth"]); if (!permitted) throw new Error("Unauthorized"); return { from(table) { calls.push(["from", table]); return query; } }; } } });
  const id = "ea8bbc33-981b-48e2-a845-ad7aac12fd4a";
  assert.equal((await actions.revealParticipantDocument({ source: "commerce", id })).success, false);
  assert.equal(calls.some(call => call[0] === "from"), false);
  permitted = true;
  assert.equal((await actions.revealParticipantDocument({ source: "profiles", id })).success, false);
  assert.equal(calls.some(call => call[0] === "from"), false);
  const result = await actions.revealParticipantDocument({ source: "commerce", id });
  assert.equal(result.success, true); assert.equal(result.documentNumber, "RSSMRA85T10A562S");
  assert.deepEqual(calls.filter(call => call[0] === "from"), [["from", "commerce_attendee_contacts"]]);
  assert.deepEqual(calls.find(call => call[0] === "select"), ["select", "document_number"]);
  assert.equal((await actions.revealParticipantDocument({ source: "legacy", id })).success, true);
  assert.deepEqual(calls.filter(call => call[0] === "eq").at(-1), ["eq", "ticket_id", id]);
});

test("the initial document representation never includes the complete identity number", () => {
  const { maskParticipantDocument } = load("../src/lib/commerce/participant-admin.ts", {});
  for (const value of ["ABC", "1234", "RSSMRA85T10A562S"]) {
    const masked = maskParticipantDocument(value);
    assert.equal(masked.includes(value), false);
    assert.match(masked, /^•+/);
  }
});
