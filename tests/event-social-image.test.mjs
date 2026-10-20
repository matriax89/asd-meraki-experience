import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports,
    require: name => name in mocks ? mocks[name] : require(name), URL, Response, console, ...environment });
  return compiledModule.exports;
}
const posters = load("src/lib/events/social-poster.ts");
const project = "https://ouygnyulrlwkiccbyeat.supabase.co";
const posterUrl = `${project}/storage/v1/object/public/events/poster.jpg`;
const event = { id: "30da43c2-3ee7-4e7d-97b4-28c789e366de", copertina_url: posterUrl };

test("legacy preview redirects accept only original public HTTPS Meraki assets", () => {
  assert.equal(posters.publicSocialPosterUrl(posterUrl, project).href, posterUrl);
  assert.equal(posters.publicSocialPosterUrl("https://www.merakiexperience.org/images/poster.png#preview", project).href, "https://www.merakiexperience.org/images/poster.png");
  for (const url of [null, "", "/images/poster.png", "http://www.merakiexperience.org/images/poster.png", "https://localhost/images/a.png", "https://127.0.0.1/images/a.png", "https://www.merakiexperience.org.evil.test/images/a.png", "https://www.merakiexperience.org:444/images/a.png", "https://user:pass@www.merakiexperience.org/images/a.png", "https://www.merakiexperience.org/api/private", `${project}/storage/v1/object/sign/events/poster.png`, `${project}/auth/v1/user`, "https://external.example.test/image.png", "file:///etc/passwd", "data:image/png;base64,AAAA"]) assert.equal(posters.publicSocialPosterUrl(url, project), null, String(url));
  assert.equal(posters.publicSocialPosterUrl("https://localhost/storage/v1/object/public/a.png", "https://localhost"), null);
});

function apiFixture({ data = event, error = null, env = {}, throwOnQuery = false } = {}) {
  const calls = [], downloads = [];
  const query = { select(columns) { calls.push(["select", columns]); return this; }, eq(name, value) { calls.push(["eq", name, value]); return this; }, maybeSingle: async () => {
    if (throwOnQuery) throw new Error("private database failure");
    return { data, error };
  } };
  const route = load("src/app/api/social/event/[id]/route.ts", {
    "@supabase/supabase-js": { createClient: (...args) => { calls.push(["client", ...args]); return { from: table => { calls.push(["from", table]); return query; } }; } },
    "@/lib/events/social-poster": posters,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: project, NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key", SUPABASE_SERVICE_ROLE_KEY: "must-never-be-used", ...env } },
    fetch: async (...args) => { downloads.push(args); throw new Error("The legacy redirect must not download or recompose images"); } });
  return { route, calls, downloads };
}
const requestPreview = (fixture, id = event.id, query = "") => fixture.route.GET(new Request(`https://www.merakiexperience.org/api/social/event/${id}${query}`), { params: Promise.resolve({ id }) });

test("already shared image URLs redirect to the unchanged poster without downloading or recomposing it", async () => {
  for (const url of [posterUrl, "https://www.merakiexperience.org/images/original-poster.webp"]) {
    const fixture = apiFixture({ data: { ...event, copertina_url: url } });
    const response = await requestPreview(fixture, event.id, "?lang=es&v=previous-share-version");
    assert.equal(response.status, 302); assert.equal(response.headers.get("location"), url);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=300");
    assert.equal(response.headers.get("content-type"), null); assert.equal(await response.text(), "");
    assert.equal(fixture.downloads.length, 0);
  }
});

test("legacy lookup stays anonymous, explicitly published and limited to the ID and poster", async () => {
  const fixture = apiFixture();
  assert.equal((await requestPreview(fixture)).status, 302);
  const client = fixture.calls.find(([kind]) => kind === "client");
  assert.equal(client[1], project); assert.equal(client[2], "public-anon-key");
  assert.equal(client[3].auth.persistSession, false); assert.equal(client[3].auth.autoRefreshToken, false); assert.equal(client[3].auth.detectSessionInUrl, false);
  assert.deepEqual(fixture.calls.filter(([kind]) => kind === "eq"), [["eq", "id", event.id], ["eq", "attivo", true]]);
  assert.equal(fixture.calls.find(([kind]) => kind === "from")[1], "events");
  assert.equal(fixture.calls.find(([kind]) => kind === "select")[1], "id,copertina_url");
});

test("draft, missing poster, unsafe poster and query failures return the same non-cacheable 404", async () => {
  for (const options of [{ data: null }, { data: { ...event, copertina_url: null } }, { data: { ...event, copertina_url: "https://external.example.test/private-image.jpg" } }, { error: { message: "private database error" } }, { throwOnQuery: true }]) {
    const fixture = apiFixture(options);
    const response = await requestPreview(fixture);
    assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("location"), null); assert.equal(await response.text(), "Event preview unavailable");
    assert.equal(fixture.downloads.length, 0);
  }
});

test("invalid IDs and missing public configuration never initiate a database lookup", async () => {
  for (const id of ["not-a-uuid", "30da43c2-3ee7-4e7d-97b4-28c789e366dg", "30da43c2-3ee7-4e7d-97b4-28c789e366de-extra"]) {
    const fixture = apiFixture(); assert.equal((await requestPreview(fixture, id)).status, 404); assert.equal(fixture.calls.length, 0);
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const fixture = apiFixture({ env: { [key]: "" } });
    assert.equal((await requestPreview(fixture)).status, 404); assert.equal(fixture.calls.length, 0);
  }
});
