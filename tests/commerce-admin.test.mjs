import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const load = (path, dependencies) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => name in dependencies ? dependencies[name] : require(name), console, Error, Intl, Date, Map });
  return exports;
};
const configModule = load("../src/lib/commerce/config.ts", {});
const statsModule = load("../src/lib/commerce/sales-stats.ts", {});
const rome = load("../src/lib/commerce/rome-time.ts", {});
const eventId = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const entryId = "0f23f119-7b2c-4238-bb3f-c69b76ad1533";
const validConfig = { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [{ id: "ws", name: "Workshop", kind: "workshop", capacity: 20, startsAt: null, salesEnd: null, menuOptions: [] }], packages: [{ id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["ws"], prices: [{ id: "early", label: "Early Bird", amountCents: 2000, startsAt: null, endsAt: null }] }], addons: [] };

function setup({ user = true, role = "admin", rpcError = null } = {}) {
  const calls = [];
  const query = (table) => ({
    select(fields) { calls.push(["select", table, fields]); return this; },
    update(patch) { calls.push(["update", table, patch]); return this; },
    eq(field, value) { calls.push(["eq", table, field, value]); return this; },
    async single() { return { data: { role }, error: null }; },
    async maybeSingle() { return { data: { id: entryId }, error: null }; },
  });
  const admin = { from: query, async rpc(name, args) { calls.push(["rpc", name, args]); return { data: true, error: rpcError }; } };
  const auth = load("../src/lib/commerce/admin-auth.ts", { "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: "operator" } : null }, error: null }) } }), createAdminClient: () => admin } });
  const actions = load("../src/app/api/admin/commerce/actions.ts", { "next/cache": { revalidatePath() {} }, "@/lib/commerce/config": configModule, "@/lib/commerce/sales-stats": statsModule, "@/lib/commerce/admin-auth": auth });
  return { calls, actions };
}

for (const options of [{ user: false }, { role: "viewer" }, { role: null }]) {
  test(`admin commerce requires a verified staff identity (${JSON.stringify(options)})`, async () => {
    const fixture = setup(options);
    assert.equal((await fixture.actions.saveCommerceAdmin(eventId, validConfig)).success, false);
    assert.equal((await fixture.actions.updateCommerceWaitlist(eventId, entryId, "notified")).success, false);
    assert.equal(fixture.calls.some(([kind, table]) => kind === "rpc" || table === "commerce_waitlist" || table === "events"), false);
  });
}

test("configuration validates on the server before the service-only save RPC", async () => {
  const fixture = setup();
  const invalid = { ...validConfig, packages: [{ ...validConfig.packages[0], activityIds: ["not-real"] }] };
  assert.equal((await fixture.actions.saveCommerceAdmin(eventId, invalid)).success, false);
  assert.equal(fixture.calls.some(([kind]) => kind === "rpc"), false);
  assert.equal((await fixture.actions.saveCommerceAdmin(eventId, validConfig)).success, true);
  const rpc = fixture.calls.find(([kind]) => kind === "rpc");
  assert.equal(rpc[1], "save_commerce_config");
  assert.equal(rpc[2].p_event_id, eventId);
});

test("missing migration is reported without pretending the config was saved", async () => {
  const fixture = setup({ rpcError: { code: "PGRST202", message: "Function not found" } });
  const result = await fixture.actions.saveCommerceAdmin(eventId, validConfig);
  assert.equal(result.success, false);
  assert.match(result.error, /migrazione commerce/);
});

test("manual waitlist changes are scoped to the event and entry, with no notification side effects", async () => {
  const fixture = setup({ role: "editor" });
  assert.equal((await fixture.actions.updateCommerceWaitlist(eventId, entryId, "notified")).success, true);
  assert.ok(fixture.calls.some(([kind, table, field, value]) => kind === "eq" && table === "commerce_waitlist" && field === "event_id" && value === eventId));
  assert.ok(fixture.calls.some(([kind, table, field, value]) => kind === "eq" && table === "commerce_waitlist" && field === "id" && value === entryId));
  assert.equal(fixture.calls.some(([kind]) => kind === "rpc"), false);
});

test("sales reporting uses immutable fulfilled orders, net of whole refunded orders, and counts upgrades", () => {
  const line = (kind, label, packageId, tierId, activityIds) => ({ kind, label, packageId, tierId, activityIds, quantity: 1, unitAmountCents: 2000, totalCents: 2000 });
  const order = (state, amount_cents, lines) => ({ state, amount_cents, quote: { totalCents: amount_cents, lines, participants: [] } });
  const stats = statsModule.calculateCommerceSalesStats([
    order("fulfilled", 4500, [line("package", "Workshop · Early Bird", "ws", "early", ["ws"]), line("addon", "Cena", undefined, undefined, ["dinner"])]),
    order("fulfilled", 2000, [line("upgrade", "WS + MC · Early Bird", "combo", "early", ["ws", "mc"])]),
    order("refunded", 3000, [line("package", "Workshop · Standard", "ws", "standard", ["ws"])]),
    order("reserved", 3000, []), order("refund_pending", 5000, []),
  ], [{ status: "paid" }, { status: "refunded" }]);
  assert.equal(stats.revenueCents, 6500); assert.equal(stats.refundedCents, 3000); assert.equal(stats.paidOrders, 2); assert.equal(stats.participants, 1);
  assert.equal(stats.packages.length, 2); assert.equal(stats.addons[0].id, "dinner");
  assert.equal(stats.tiers.length, 2); assert.notEqual(stats.tiers[0].id, stats.tiers[1].id);
});

test("administrative time conversion uses Rome in winter and summer, rejects DST gaps and repeats", () => {
  assert.equal(rome.fromRomeInput("2026-12-01T10:30"), "2026-12-01T09:30:00.000Z");
  assert.equal(rome.fromRomeInput("2026-08-01T10:30"), "2026-08-01T08:30:00.000Z");
  assert.equal(rome.toRomeInput("2026-08-01T08:30:00Z"), "2026-08-01T10:30");
  assert.throws(() => rome.fromRomeInput("2026-03-29T02:30"), /non esiste/);
  assert.throws(() => rome.fromRomeInput("2026-10-25T02:30"), /ambigua/);
});


test("the admin example is opt-in, stays disabled, and only saves valid explicit settings", async () => {
  const { JSDOM } = await import("jsdom");
  const React = await import("react");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://meraki.test", pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const saved = [];
  const component = load("../src/components/admin/commerce-config-editor.tsx", {
    "@/app/api/admin/commerce/actions": { saveCommerceAdmin: async (_event, config) => { saved.push(JSON.parse(JSON.stringify(config))); return { success: true }; }, updateCommerceWaitlist: async () => ({ success: true }) },
    "@/lib/commerce/rome-time": rome,
    "@/lib/commerce/config": configModule,
  });
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await React.act(async () => root.render(React.createElement(component.CommerceConfigEditor, { eventId, initialConfig: null, stats: { paidOrders: 0, revenueCents: 0, refundedCents: 0, participants: 0, packages: [], tiers: [], addons: [] }, initialWaitlist: [] })));
    assert.equal(dom.window.document.querySelectorAll("input[type='number']").length, 0);
    const template = [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("Usa esempio"));
    await React.act(async () => template.click());
    const activation = dom.window.document.querySelector("input[type='checkbox']");
    assert.equal(activation.checked, false);
    await React.act(async () => dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(saved.length, 1); assert.equal(saved[0].enabled, false);
    assert.equal(saved[0].packages.length, 3); assert.equal(saved[0].addons[0].amountCents, 2500);
    await React.act(async () => activation.click());
    await React.act(async () => dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(saved.length, 2); assert.equal(saved[1].enabled, true);
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
