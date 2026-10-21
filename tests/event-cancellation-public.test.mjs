import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), URL, process: { env: {} } });
  return compiledModule.exports;
}
const copy = load("lib/events/cancellation-copy.ts");
const i18n = load("lib/i18n-utils.ts");
const component = load("components/meraki/canceled-event.tsx", {
  "@/i18n/routing": { Link: ({ children, ...props }) => createElement("a", props, children) },
  "@/lib/events/cancellation-copy": copy,
  "./event-poster": { EventPoster: () => createElement("div", { "data-poster": true }) },
});
const canceledEvent = { slug: "meraki-canceled", tipo: "evento", titolo: { it: "Meraki <Annullato>", en: "Meraki <Canceled>", de: "Meraki <Abgesagt>", es: "Meraki <Cancelado>" }, canceled_at: "2026-10-21T10:00:00Z", cancellation_reason: "Motivo <script>alert('unsafe')</script>", copertina_url: "/locandina.jpg" };

test("canceled public lookup uses a minimal allowlist and requires explicit cancellation, never an ordinary draft", async () => {
  const calls = [];
  const query = { select(value) { calls.push(["select", value]); return this; }, eq(...args) { calls.push(["eq", ...args]); return this; }, in(...args) { calls.push(["in", ...args]); return this; }, not(...args) { calls.push(["not", ...args]); return this; }, maybeSingle: async () => ({ data: canceledEvent, error: null }) };
  const loader = load("lib/events/canceled-public-event.ts", { "server-only": {}, "@/lib/supabase/server": { createAdminClient: () => ({ from(table) { assert.equal(table, "events"); return query; } }) } });
  assert.equal(await loader.getCanceledPublicEvent("meraki-canceled", ["evento"]), canceledEvent);
  assert.deepEqual(calls.find(([method]) => method === "not"), ["not", "canceled_at", "is", null]);
  assert.deepEqual(calls.find(([method]) => method === "eq"), ["eq", "slug", "meraki-canceled"]);
  const columns = calls.find(([method]) => method === "select")[1].split(",").sort();
  assert.deepEqual(columns, ["slug", "tipo", "titolo", "data_inizio", "copertina_url", "canceled_at", "cancellation_reason"].sort());
  assert.equal(await loader.getCanceledPublicEvent("", ["evento"]), null);
  assert.equal(await loader.getCanceledPublicEvent("x".repeat(201), ["evento"]), null);
  assert.equal(calls.filter(([method]) => method === "select").length, 1);
});

test("unavailable canceled public lookup fails closed without exposing unpublished event data or private database details", async () => {
  const query = { select() { return this; }, eq() { return this; }, in() { return this; }, not() { return this; }, maybeSingle: async () => ({ data: canceledEvent, error: { code: "42703" } }) };
  const loader = load("lib/events/canceled-public-event.ts", { "server-only": {}, "@/lib/supabase/server": { createAdminClient: () => ({ from: () => query }) } });
  await assert.rejects(loader.getCanceledPublicEvent("meraki-canceled", ["evento"]), error => error.message === "Impossibile verificare lo stato dell’evento." && !error.message.includes("42703"));
});

function page(route, canceled = canceledEvent, active = null) {
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, in() { return this; }, single: async () => ({ data: active }) };
  const compiled = load(`app/[locale]/(public)/${route}/[slug]/page.tsx`, {
    "next/navigation": { notFound() { throw new Error("not found"); } },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "@/lib/i18n-utils": i18n,
    "@/components/meraki/event-detail": { EventDetail: () => createElement("div", { "data-active-event": true }) },
    "@/components/meraki/events-data": { eventFeedColumns: "id", toMerakiEvent: value => value },
    "@/lib/events/logistics": { parseEventLogistics: () => null },
    "@/lib/events/affiliates": { publicEventAffiliates: () => [] },
    "@/lib/events/social-data": { getSocialEvent: async () => active },
    "@/lib/events/social-metadata": { eventSocialMetadata: () => ({ title: "Active event" }) },
    "@/lib/commerce/config": { parseCommerceConfig: () => null },
    "@/lib/events/canceled-public-event": { getCanceledPublicEvent: async (slug, types) => { calls.push({ slug, types: Array.from(types) }); return canceled; } },
    "@/components/meraki/canceled-event": component,
    "@/lib/events/cancellation-copy": copy,
  });
  return { ...compiled, calls };
}

for (const route of ["eventi", "workshop"]) for (const locale of ["it", "en", "de", "es"]) {
  test(`${route} ${locale}: canceled event has a clear public notice without prices, checkout or a premature refund claim`, async () => {
    const compiled = page(route);
    const params = Promise.resolve({ slug: canceledEvent.slug, locale });
    const rendered = await compiled.default({ params });
    const document = new JSDOM(renderToStaticMarkup(rendered)).window.document;
    const t = copy.eventCancellationCopy(locale);
    assert.ok(document.querySelector("[data-event-canceled]"));
    assert.equal(document.querySelector("h1").textContent, canceledEvent.titolo[locale]);
    assert.ok(document.body.textContent.includes(t.title));
    assert.ok(document.body.textContent.includes(t.body));
    assert.ok(document.body.textContent.includes(canceledEvent.cancellation_reason));
    assert.equal(document.querySelector("script,input,form,button,[data-event-ticketing]"), null);
    assert.equal(document.querySelectorAll('a[href="/contatti"]').length, 1);
    assert.equal(document.querySelectorAll('a[href="/eventi"]').length, 1);
    const metadata = await compiled.generateMetadata({ params });
    assert.ok(metadata.title.includes(t.title));
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, false);
    assert.deepEqual(compiled.calls[0].types, route === "eventi" ? ["evento"] : ["workshop", "masterclass"]);
  });
}

test("ordinary hidden event remains not found and active event uses its usual detail without cancellation lookup", async () => {
  const hidden = page("eventi", null);
  await assert.rejects(hidden.default({ params: Promise.resolve({ slug: "draft", locale: "it" }) }), /not found/);
  const active = page("eventi", canceledEvent, { id: "active", descrizione: { it: "Descrizione" }, cta_tipo: "stripe", cta_url: null });
  const rendered = await active.default({ params: Promise.resolve({ slug: "active", locale: "it" }) });
  assert.ok(renderToStaticMarkup(rendered).includes("data-active-event"));
  assert.equal(active.calls.length, 0);
});

test("verified commerce tickets hide upgrades after a refund without revoking unaffected QR admissions", async () => {
  const pass = { id: "10000000-0000-4000-a000-000000000001", event_id: "event", order_id: "order", status: "paid", package_id: "ws", package_name: "Workshop", first_name: "Ada", last_name: "Prova" };
  for (const scenario of [
    { rights: "valid", refunds: [], expected: true },
    ...["preparing", "pending", "requires_action", "unknown", "succeeded"].map(status => ({ rights: "valid", refunds: [{ id: "goodwill-refund", status }], expected: false })),
    { rights: "valid", refunds: [], error: { code: "42P01" }, expected: false },
    { rights: "refunded", refunds: [], expected: false },
    { rights: "valid", canceled: true, refunds: [], expected: false },
  ]) {
    let refundReads = 0;
    const db = { from(table) { return {
      select() { return this; }, eq() { return this; }, in(column, values) {
        if (table === "meraki_refunds" && column === "status") assert.deepEqual(Array.from(values), ["preparing", "pending", "requires_action", "unknown", "succeeded"]);
        return this;
      }, order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data: pass }),
      single: async () => ({ data: { titolo: { it: "Meraki" }, canceled_at: scenario.canceled ? "2026-10-21T10:00:00Z" : null, commerce_config: null } }),
      then(resolve) {
        if (table === "meraki_refunds") { refundReads++; return resolve({ data: scenario.refunds, error: scenario.error }); }
        return resolve({ data: table === "commerce_orders" ? [{ id: "order", state: "fulfilled", event_snapshot: {} }] : [{ pass_id: pass.id, order_id: "order", activity_id: "ws", activity_name: "Workshop", status: scenario.rights }], error: null });
      },
    }; } };
    const server = load("lib/commerce/server.ts", {
      "@supabase/supabase-js": { createClient: () => db }, "@/lib/i18n-utils": i18n,
      "./config": { parseCommerceConfig: () => null },
      "@/lib/tickets/wallet": {},
      "./localization": { commercePackageName: (_config, _id, fallback) => fallback, commerceActivityName: (_config, _id, fallback) => fallback },
      "@/lib/events/affiliates": {}, "@/lib/events/activity-timing": { resolveActivityTiming: () => ({}) },
    });
    const verified = await server.getCommercePass(pass.id, "private-test-only", "it");
    assert.equal(verified.upgradesAllowed, scenario.expected);
    assert.equal(verified.pass.status, "paid");
    assert.equal(verified.entitlements[0].status, scenario.rights === "valid" ? "available" : "revoked");
    assert.equal(refundReads, scenario.rights === "refunded" || scenario.canceled ? 0 : 1);
    assert.equal("refunds" in verified, false, "a token holder receives only the permission flag, never the financial ledger");
  }
});
