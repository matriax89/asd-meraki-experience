import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const instant = "2099-10-20T10:00:00.000Z";
class FeedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return Date.parse(instant); }
}
const plain = value => JSON.parse(JSON.stringify(value));
function load(path, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name] || require(name), Date: FeedDate, Map, Set, console: mocks.console || console });
  return exports;
}
const configModule = load("src/lib/commerce/config.ts");
const tier = (id, amountCents, startsAt = null, endsAt = null) => ({ id, label: id, amountCents, startsAt, endsAt });
const event = (id = "event-1") => ({ id, slug: id, type: "evento", title: "Evento", subtitle: "", startsAt: "2099-12-19T12:00:00Z", endsAt: null, cover: null, location: null, address: null, price: 1500, capacity: null, sold: 0 });
const config = () => ({
  version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true,
  activities: [
    { id: "ws", name: "Workshop", kind: "workshop", capacity: 100, startsAt: "2099-12-19T12:00:00Z", salesEnd: null, menuOptions: [] },
    { id: "mc", name: "Masterclass", kind: "masterclass", capacity: 80, startsAt: "2099-12-19T15:00:00Z", salesEnd: "2099-12-18T18:00:00Z", menuOptions: [] },
  ],
  packages: [
    { id: "ws", name: "Workshop", nameTranslations: { en: "Workshop EN", de: "Workshop DE", es: "Taller" }, description: "Description omitted from public price preview", activityIds: ["ws"], prices: [tier("early", 4500, null, "2099-12-04T22:59:00Z"), tier("standard", 5500, "2099-12-04T23:00:00Z")] },
    { id: "mc", name: "Masterclass", description: "", activityIds: ["mc"], prices: [tier("early", 3500, null, "2099-12-04T22:59:00Z"), tier("standard", 4500, "2099-12-04T23:00:00Z")] },
    { id: "bundle", name: "Workshop + Masterclass", description: "", activityIds: ["ws", "mc"], prices: [
      { ...tier("early", 6500, null, "2099-12-04T22:59:00Z"), label: "Early Bird", labelTranslations: { de: "Frühbucher" }, activityAmounts: { ws: 3500, mc: 3000 } },
      { ...tier("standard", 8500, "2099-12-04T23:00:00Z"), activityAmounts: { ws: 4500, mc: 4000 } },
    ] },
  ],
  addons: [],
});

function feed(rows = [], error = null) {
  const calls = [], warnings = [];
  const db = { from(table) { calls.push(["from", table]); return { select(columns) { calls.push(["select", columns]); return { async in(column, values) { calls.push(["in", column, values]); return { data: rows, error }; } }; } }; } };
  const feedModule = load("src/lib/commerce/feed.ts", {
    "./server": { commerceClient: () => db, missingCommerceMigration: value => value?.code === "42703" },
    "./config": configModule,
    console: { error: (...args) => warnings.push(args) },
  });
  return { enrich: feedModule.enrichCommerceFeed, calls, warnings };
}

test("the feed makes one bulk read and publishes only package prices, translations and sales deadlines", async () => {
  const original = config();
  const source = [event(), event("legacy")];
  const api = feed([{ id: "legacy", commerce_config: null }, { id: "event-1", cta_tipo: "stripe", commerce_config: original }]);
  const enriched = await api.enrich(source);
  assert.deepEqual(api.calls, [["from", "events"], ["select", "id,commerce_config,cta_tipo"], ["in", "id", ["event-1", "legacy"]]]);
  const projection = plain(enriched[0].packagePrices);
  assert.equal(enriched[0].price, 3500);
  assert.equal(enriched[0].priceFrom, true);
  assert.equal(projection.length, 3);
  assert.deepEqual(projection[0].nameTranslations, original.packages[0].nameTranslations);
  assert.deepEqual(projection[2].prices[0].labelTranslations, { de: "Frühbucher" });
  assert.deepEqual(projection[0].prices.map(value => value.amountCents), [4500, 5500]);
  assert.deepEqual(Object.keys(projection[2]).sort(), ["id", "name", "prices", "salesCloseAt"]);
  assert.deepEqual(Object.keys(projection[2].prices[0]).sort(), ["amountCents", "endsAt", "id", "label", "labelTranslations", "startsAt"]);
  for (const privateKey of ["activityAmounts", "activityIds", "description", "capacity", "menuOptions", "activities", "addons", "upgradesEnabled"]) {
    assert.equal(JSON.stringify(projection).includes(`"${privateKey}"`), false, privateKey);
  }
  assert.equal(enriched[1], source[1]);
  assert.equal(source[0].packagePrices, undefined);
  assert.equal(original.packages[2].prices[0].activityAmounts.ws, 3500);
});

test("empty feeds do not contact the database", async () => {
  const api = feed();
  const source = [];
  assert.equal(await api.enrich(source), source);
  assert.equal(api.calls.length, 0);
});

test("legacy, non-Stripe, disabled, malformed and missing rows retain their existing event prices", async () => {
  const source = ["legacy", "external", "disabled", "invalid", "missing"].map(event);
  const api = feed([
    { id: "legacy", cta_tipo: "stripe", commerce_config: null },
    { id: "external", cta_tipo: "link", commerce_config: config() },
    { id: "disabled", cta_tipo: "stripe", commerce_config: { ...config(), enabled: false } },
    { id: "invalid", cta_tipo: "stripe", commerce_config: { ...config(), packages: [{ ...config().packages[0], prices: [tier("invalid", -1)] }] } },
  ]);
  const enriched = await api.enrich(source);
  enriched.forEach((value, index) => assert.equal(value, source[index]));
});

test("a missing CTA type preserves the legacy Stripe default", async () => {
  const api = feed([{ id: "event-1", cta_tipo: null, commerce_config: config() }]);
  assert.equal((await api.enrich([event()]))[0].packagePrices.length, 3);
});

test("migration and transient read errors keep the feed usable without publishing error details", async () => {
  for (const error of [{ code: "42703", message: "missing commerce column" }, { code: "other", message: "private database error" }]) {
    const api = feed(null, error);
    const source = [event()];
    assert.equal(await api.enrich(source), source);
    assert.deepEqual(api.warnings, error.code === "42703" ? [] : [["Commerce feed prices temporarily unavailable."]]);
  }
});

test("minimum price uses only the current tier while the projection retains expired and future tiers", async () => {
  const settings = config();
  settings.packages = [{ ...settings.packages[0], prices: [
    tier("expired", 100, null, instant),
    tier("current", 4500, instant, "2099-12-04T22:59:00Z"),
    tier("future", 1000, "2099-12-04T22:59:00Z"),
  ] }];
  const api = feed([{ id: "event-1", commerce_config: settings }]);
  const result = (await api.enrich([event()]))[0];
  assert.equal(result.price, 4500);
  assert.deepEqual(plain(result.packagePrices[0].prices).map(value => value.id), ["expired", "current", "future"]);
});

test("activity start or earlier sales deadline closes the package exactly at the boundary", async () => {
  const settings = config();
  settings.activities[0].startsAt = instant;
  settings.activities[1].salesEnd = "2099-10-20T09:59:00Z";
  const api = feed([{ id: "event-1", commerce_config: settings }]);
  const result = (await api.enrich([event()]))[0];
  assert.equal(result.price, null);
  assert.equal(result.priceFrom, true);
  assert.deepEqual(plain(result.packagePrices).map(value => value.salesCloseAt), [instant, "2099-10-20T09:59:00.000Z", "2099-10-20T09:59:00.000Z"]);
  assert.equal(result.packagePrices.length, 3, "retain closed packages so the UI has the full schedule");
});

test("packages with no dated activities have no sales deadline and tier gaps have no current price", async () => {
  const settings = config();
  settings.activities[0].startsAt = null;
  settings.packages = [{ ...settings.packages[0], prices: [tier("future", 4500, "2099-12-01T00:00:00Z")] }];
  const api = feed([{ id: "event-1", commerce_config: settings }]);
  const result = (await api.enrich([event()]))[0];
  assert.equal(result.packagePrices[0].salesCloseAt, null);
  assert.equal(result.price, null);
  assert.equal(result.priceFrom, true);
});
