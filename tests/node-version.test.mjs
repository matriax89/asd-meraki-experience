import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isSupportedNodeVersion } from "../check-node-version.mjs";

test("the security baseline allows patched stable Node 24 releases and excludes older or different majors", () => {
  for (const value of ["24.22.1", "v24.22.1", "24.22.2", "24.23.0", "24.100.0"]) {
    assert.equal(isSupportedNodeVersion(value), true, value);
  }
  for (const value of ["24.22.0", "24.21.99", "24.0.0", "22.23.4", "20.19.0", "25.0.0", "26.12.1"]) {
    assert.equal(isSupportedNodeVersion(value), false, value);
  }
});

test("malformed, prerelease and coerced values cannot pass the build runtime check", () => {
  for (const value of [undefined, null, 24, {}, [24, 22, 1], "", "24", "24.22", "24.22.1.0", "24.22.1-rc.1", "24.22.1+custom", "24.022.1", "24.22.01", " 24.22.1", "24.22.1\n", "24.22.1\u0000", "24.90071992547409930.0", "node v24.22.1", "24.22.1 || 22.0.0"]) {
    assert.equal(isSupportedNodeVersion(value), false, String(value));
  }
});

test("the executable guard reports only the running Node version and exits before an unsupported build", () => {
  const guard = fileURLToPath(new URL("../check-node-version.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [guard], { encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, isSupportedNodeVersion(process.versions.node) ? 0 : 1);
  assert.ok((result.stdout + result.stderr).includes(process.version));
  assert.equal((result.stdout + result.stderr).trim().split("\n").length, 1);
  assert.match(result.stdout + result.stderr, />=24\.22\.1 <25/);
});

test("project metadata and the build command share the same patched Node baseline", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.engines.node, ">=24.22.1 <25");
  assert.deepEqual(lock.packages[""].engines, manifest.engines);
  assert.equal(readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim(), "24.22.1");
  assert.ok(manifest.scripts.build.startsWith("node check-node-version.mjs && "));
});
