import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { nativeFormControlMocks } from "./helpers/native-form-controls.mjs";

const require = createRequire(import.meta.url);
const load = (path, dependencies) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => name in dependencies ? dependencies[name] : nativeFormControlMocks[name] || require(name), console, Error, Intl, Date, Map, crypto: globalThis.crypto });
  return exports;
};
const discountModule = load("../src/lib/commerce/discounts.ts", {});
const configModule = load("../src/lib/commerce/config.ts", {});
const statsModule = load("../src/lib/commerce/sales-stats.ts", {});
const rome = load("../src/lib/commerce/rome-time.ts", {});
const wizard = load("../src/components/admin/wizard-steps.tsx", {});
const eventId = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const entryId = "0f23f119-7b2c-4238-bb3f-c69b76ad1533";
const validConfig = { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [{ id: "ws", name: "Workshop", kind: "workshop", capacity: 20, startsAt: null, salesEnd: null, menuOptions: [] }], packages: [{ id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["ws"], prices: [{ id: "early", label: "Early Bird", amountCents: 2000, startsAt: null, endsAt: null }] }], addons: [] };

function setup({ user = true, role = "admin", rpcError = null, rpcData = { saved: true }, currentConfig = validConfig, publishConflict = false } = {}) {
  const calls = [];
  const query = (table) => ({
    select(fields) { calls.push(["select", table, fields]); return this; },
    update(patch) { calls.push(["update", table, patch]); return this; },
    eq(field, value) { calls.push(["eq", table, field, value]); return this; },
    async single() { return { data: table === "events" ? { commerce_config: currentConfig, updated_at: "2026-10-19T12:00:00Z" } : { role }, error: null }; },
    async maybeSingle() { return { data: table === "events" && publishConflict ? null : { id: table === "events" ? eventId : entryId }, error: null }; },
  });
  const admin = { from: query, async rpc(name, args) { calls.push(["rpc", name, args]); return { data: rpcData, error: rpcError }; } };
  const auth = load("../src/lib/commerce/admin-auth.ts", { "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: "operator" } : null }, error: null }) } }), createAdminClient: () => admin } });
  const actions = load("../src/app/api/admin/commerce/actions.ts", { "next/cache": { revalidatePath() {} }, "@/lib/commerce/config": configModule, "@/lib/commerce/discounts": discountModule, "@/lib/commerce/sales-stats": statsModule, "@/lib/commerce/admin-auth": auth });
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

test("publishing a draft first confirms the validated transaction, then updates only that event version", async () => {
  const fixture = setup();
  const result = await fixture.actions.saveCommerceAdmin(eventId, validConfig, { publish: true });
  assert.equal(result.success, true);
  assert.equal(result.published, true);
  const savedIndex = fixture.calls.findIndex(([kind]) => kind === "rpc");
  const publishIndex = fixture.calls.findIndex(([kind, table]) => kind === "update" && table === "events");
  assert.ok(savedIndex >= 0 && publishIndex > savedIndex);
  assert.equal(fixture.calls[publishIndex][2].attivo, true);
  assert.equal(fixture.calls[publishIndex][2].commerce_config, undefined);
  assert.ok(fixture.calls.some(([kind, table, key, value]) => kind === "eq" && table === "events" && key === "id" && value === eventId));
  assert.ok(fixture.calls.some(([kind, table, key, value]) => kind === "eq" && table === "events" && key === "updated_at" && value === "2026-10-19T12:00:00Z"));
});

test("saving a draft never publishes it, and disabled, failed or changed configurations cannot be published", async () => {
  const saved = setup();
  assert.equal((await saved.actions.saveCommerceAdmin(eventId, validConfig)).success, true);
  assert.equal(saved.calls.some(([kind, table]) => kind === "update" && table === "events"), false);
  for (const [fixture, config] of [
    [setup(), { ...validConfig, enabled: false }],
    [setup({ rpcError: { code: "PGRST202", message: "Missing migration" } }), validConfig],
    [setup({ rpcData: { error: "issued_activity_removed" } }), validConfig],
    [setup({ rpcData: null }), validConfig],
    [setup({ currentConfig: { ...validConfig, waitlistEnabled: false } }), validConfig],
  ]) {
    assert.equal((await fixture.actions.saveCommerceAdmin(eventId, config, { publish: true })).success, false);
    assert.equal(fixture.calls.some(([kind, table]) => kind === "update" && table === "events"), false);
  }
  const concurrent = setup({ publishConflict: true });
  const result = await concurrent.actions.saveCommerceAdmin(eventId, validConfig, { publish: true });
  assert.equal(result.success, false);
  assert.match(result.error, /non è stato pubblicato/);
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


async function editorFixture({ initialConfig = null, isPublished = false, realEuro = false } = {}) {
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
    "@/app/api/admin/commerce/actions": { saveCommerceAdmin: async (_event, config, options) => { saved.push({ config: JSON.parse(JSON.stringify(config)), options }); return { success: true, published: Boolean(options?.publish) }; }, updateCommerceWaitlist: async () => ({ success: true }) },
    "@/lib/commerce/rome-time": rome, "@/lib/commerce/config": configModule,
    "@/components/admin/wizard-steps": wizard,
    ...(realEuro ? { "@/components/admin/euro-input": load("../src/components/admin/euro-input.tsx", {}) } : {}),
  });
  const root = createRoot(dom.window.document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(component.CommerceConfigEditor, { eventId, initialConfig, stats: { paidOrders: 0, revenueCents: 0, refundedCents: 0, participants: 0, packages: [], tiers: [], addons: [] }, initialWaitlist: [], isPublished })));
  const document = dom.window.document;
  const button = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text || node.querySelector(":scope > span:last-child")?.textContent === text);
  const click = async (text) => { const node = button(text); assert.ok(node, `button ${text} exists`); await React.act(async () => node.click()); };
  const input = async (node, value) => React.act(async () => {
    const prototype = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const panel = (step) => document.querySelector(`[data-commerce-step="${step}"]`);
  const currentStep = () => Number(document.querySelector("[data-commerce-step]:not([hidden])").dataset.commerceStep);
  return { dom, document, React, saved, button, click, input, panel, currentStep, async close() {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  } };
}

test("the example is opt-in and a published event is saved only after its explicit review action", async () => {
  const fixture = await editorFixture({ isPublished: true });
  const { document, React, saved, click, button, currentStep, panel } = fixture;
  try {
    assert.equal(document.querySelectorAll("input[type='number']").length, 0);
    assert.equal(button("Salva configurazione"), undefined);
    assert.equal(button("Formule e prezzi").disabled, true);
    await click("Usa esempio WS + MC + cena");
    assert.equal(saved.length, 0);
    assert.equal(panel(3).querySelector("input[type='checkbox']").checked, false);
    await click("Avanti"); await click("Avanti"); await click("Avanti");
    assert.equal(currentStep(), 3);
    assert.equal(saved.length, 0, "navigation never persists changes");
    await click("Salva configurazione");
    assert.equal(saved.length, 1); assert.equal(saved[0].config.enabled, false);
    assert.equal(saved[0].config.packages.length, 3); assert.equal(saved[0].config.addons[0].amountCents, 2500);
    await React.act(async () => panel(3).querySelector("input[type='checkbox']").click());
    await click("Salva configurazione");
    assert.equal(saved.length, 2); assert.equal(saved[1].config.enabled, true);
    assert.equal(saved[1].options, undefined);
    assert.equal(document.querySelector("details").closest("form"), null);
    assert.equal(document.getElementById("commerce-waitlist").closest("form"), null);
  } finally { await fixture.close(); }
});

test("the four-step draft retains dates and amounts, summarizes real values, and publishes only from review", async () => {
  const fixture = await editorFixture();
  const { dom, document, React, saved, click, button, input, panel, currentStep } = fixture;
  try {
    assert.match(document.body.textContent, /Evento in bozza/);
    assert.equal(button("Salva e pubblica evento"), undefined);
    assert.equal(document.querySelector("details").open, false);
    await click("Usa esempio WS + MC + cena");
    assert.equal(document.querySelectorAll("textarea").length, 3);
    assert.equal(document.querySelectorAll("input[type='datetime-local']").length, 12);
    assert.equal(panel(1).hidden, true); assert.equal(panel(1).disabled, true);
    const option = document.createElement("div"); option.setAttribute("role", "option");
    document.querySelector("form").append(option);
    await React.act(async () => option.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(currentStep(), 0, "Enter on a select popup option must not advance the wizard");
    option.remove();
    const activityName = panel(0).querySelector("input[required]");
    await React.act(async () => activityName.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(currentStep(), 1, "Enter advances, it does not save the draft");
    assert.equal(saved.length, 0);
    const firstFormula = [...panel(1).querySelectorAll("fieldset")].find((fieldset) => fieldset.firstElementChild?.textContent === "Formula 1");
    const firstTier = [...firstFormula.querySelectorAll("fieldset")].find((fieldset) => fieldset.firstElementChild?.textContent === "Scaglione 1");
    const endsAt = [...firstTier.querySelectorAll("label")].find((label) => label.textContent.startsWith("Valido fino a")).querySelector("input");
    await input(endsAt, "2026-11-01T00:00");
    await React.act(async () => [...firstFormula.querySelectorAll("button")].find((node) => node.textContent.includes("Aggiungi scaglione")).click());
    const secondTier = [...firstFormula.querySelectorAll("fieldset")].find((fieldset) => fieldset.firstElementChild?.textContent === "Scaglione 2");
    const startsAt = [...secondTier.querySelectorAll("label")].find((label) => label.textContent.startsWith("Valido da")).querySelector("input");
    assert.equal(startsAt.value, "2026-11-01T00:00");
    const amount = secondTier.querySelector("input[type='number']");
    await input(amount, "35");
    await click("Indietro");
    assert.equal(endsAt.isConnected, true, "date inputs remain mounted");
    assert.equal(panel(1).disabled, true);
    await click("Avanti");
    assert.equal(startsAt.value, "2026-11-01T00:00"); assert.equal(amount.value, "35");
    await click("Salva bozza");
    assert.equal(saved.length, 1); assert.equal(saved[0].options, undefined); assert.equal(saved[0].config.enabled, false);
    assert.equal(saved[0].config.packages[0].prices[0].endsAt, "2026-10-31T23:00:00.000Z");
    assert.equal(saved[0].config.packages[0].prices[1].startsAt, "2026-10-31T23:00:00.000Z");
    assert.equal(saved[0].config.packages[0].prices[1].amountCents, 3500);
    assert.equal(saved[0].config.addons[0].activityId, "cena");
    assert.deepEqual(saved[0].config.activities.find((activity) => activity.id === "cena").menuOptions, ["Standard", "Vegetariano"]);
    assert.match(document.body.textContent, /Bozza salvata/);
    await click("Avanti"); await click("Avanti");
    assert.equal(currentStep(), 3); assert.equal(saved.length, 1);
    assert.match(panel(3).textContent, /Solo Workshop/); assert.match(panel(3).textContent, /Workshop \+ Masterclass/);
    assert.match(panel(3).textContent, /35,00/); assert.match(panel(3).textContent, /25,00/);
    assert.match(panel(3).textContent, /01\/11\/26, 00:00/); assert.match(panel(3).textContent, /Standard · Vegetariano/);
    await React.act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(saved.length, 1, "implicit submit on review cannot publish");
    await click("Modifica formule e prezzi"); assert.equal(currentStep(), 1);
    assert.equal(amount.isConnected, true); assert.equal(amount.value, "35");
    await click("Riepilogo e pubblicazione"); assert.equal(currentStep(), 3);
    await click("Salva e pubblica evento");
    assert.equal(saved.length, 2); assert.equal(saved[1].options.publish, true); assert.equal(saved[1].config.enabled, true);
    assert.deepEqual(saved[1].config.activities, saved[0].config.activities);
    assert.deepEqual(saved[1].config.packages, saved[0].config.packages);
    assert.match(document.body.textContent, /Evento pubblicato/);
    assert.equal(button("Salva e pubblica evento"), undefined);
  } finally { await fixture.close(); }
});

test("Next validates its section and draft saves return to the section containing a schema error", async () => {
  const fixture = await editorFixture();
  const { document, saved, click, input, panel, currentStep } = fixture;
  try {
    await click("Avanti"); assert.equal(currentStep(), 0); assert.equal(saved.length, 0);
    assert.match(document.body.textContent, /Aggiungi almeno un’attività/);
    await click("Aggiungi attività"); await click("Avanti"); assert.equal(currentStep(), 1);
    await click("Avanti"); assert.equal(currentStep(), 1);
    assert.match(document.body.textContent, /Aggiungi almeno un’attività e una formula/);
    await click("Aggiungi formula");
    await click("Avanti"); assert.equal(currentStep(), 1);
    assert.match(document.body.textContent, /Formula 1:/);
    await click("Indietro");
    await click("Salva bozza"); assert.equal(currentStep(), 1); assert.equal(saved.length, 0);
    const included = panel(1).querySelector("input[type='checkbox']");
    await fixture.React.act(async () => included.click());
    await click("Avanti"); assert.equal(currentStep(), 2);
    await input(panel(2).querySelector("textarea"), "Vegetariano\nVegetariano");
    await click("Indietro"); await click("Salva bozza");
    assert.equal(currentStep(), 2); assert.equal(saved.length, 0);
    assert.match(document.body.textContent, /I valori devono essere univoci/);
  } finally { await fixture.close(); }
});

test("a raw invalid euro draft survives Back and blocks saving even while its panel is disabled", async () => {
  const fixture = await editorFixture({ initialConfig: JSON.parse(JSON.stringify(validConfig)), realEuro: true });
  const { document, React, saved, click, input, panel, currentStep } = fixture;
  try {
    await click("Avanti");
    const amount = [...panel(1).querySelectorAll("label")].find((label) => label.textContent.startsWith("Prezzo (€)")).querySelector("input");
    await React.act(async () => amount.focus());
    await input(amount, "20,123");
    assert.equal(amount.validity.valid, false);
    await click("Indietro"); assert.equal(currentStep(), 0);
    assert.equal(amount.isConnected, true); assert.equal(amount.value, "20,123");
    assert.equal(panel(1).disabled, true);
    await click("Salva bozza");
    assert.equal(saved.length, 0); assert.equal(currentStep(), 1);
    assert.equal(document.activeElement, amount, "the hidden invalid field is revealed before focus");
    assert.equal(amount.value, "20,123", "the invalid draft is not silently replaced by the last saved amount");
    await click("Avanti"); assert.equal(currentStep(), 1);
    await input(amount, "20,25");
    await click("Avanti"); assert.equal(currentStep(), 2);
    const date = panel(0).querySelector("input[type='datetime-local']");
    date.setCustomValidity("Orario incompleto");
    await click("Salva bozza"); assert.equal(saved.length, 0); assert.equal(currentStep(), 0);
    assert.equal(document.activeElement, date);
    date.setCustomValidity("");
    await click("Salva bozza"); assert.equal(saved.length, 1);
    assert.equal(saved[0].config.packages[0].prices[0].amountCents, 2025);
  } finally { await fixture.close(); }
});

for (const isPublished of [false, true]) {
  test(`the final Next click cannot become a submission when review renders (published=${isPublished})`, async () => {
    const fixture = await editorFixture({ initialConfig: JSON.parse(JSON.stringify(validConfig)), isPublished });
    const { React, click, button, saved, currentStep } = fixture;
    try {
      await click("Avanti"); await click("Avanti");
      assert.equal(currentStep(), 2);
      const next = button("Avanti");
      let navigationClick;
      next.addEventListener("click", (event) => { navigationClick = event; }, { once: true });
      await React.act(async () => next.click());
      assert.equal(currentStep(), 3);
      assert.equal(saved.length, 0, "reaching review must not save or publish");
      assert.equal(navigationClick.defaultPrevented, true, "navigation cancels the browser's click default action");
      assert.equal(next.isConnected, false, "the navigation node is never reused as a submit button");
      const submit = button(isPublished ? "Salva configurazione" : "Salva e pubblica evento");
      assert.ok(submit); assert.notEqual(submit, next); assert.equal(submit.type, "submit");
      await React.act(async () => submit.click());
      assert.equal(saved.length, 1, "saving still requires a separate explicit click");
      assert.equal(Boolean(saved[0].options?.publish), !isPublished);
    } finally { await fixture.close(); }
  });
}

const validDiscount = { code: "MERAKI20", name: "Promo workshop", active: true, startsAt: null, endsAt: null, discountType: "percentage", discountValue: 20, minSubtotalCents: 0, maxUses: 10, targetType: "activity", targetIds: ["ws"], allowedTierIds: [] };
const discountRow = { id: "b12aba53-9496-49d3-9ac6-d38a21ac2ad4", event_id: eventId, code: "MERAKI20", name: "Promo workshop", active: true, starts_at: null, ends_at: null, discount_type: "percentage", discount_value: 20, min_subtotal_cents: 0, max_uses: 10, target_type: "activity", target_ids: ["ws"], allowed_tier_ids: [], created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z", reserved_uses: 1, redeemed_uses: 2 };
for (const options of [{ user: false }, { role: "viewer" }, { role: null }]) {
  test(`private discount listing and saves verify staff identity (${JSON.stringify(options)})`, async () => {
    const fixture = setup(options);
    assert.equal((await fixture.actions.loadCommerceDiscountsAdmin(eventId)).success, false);
    assert.equal((await fixture.actions.saveCommerceDiscountAdmin(eventId, validDiscount)).success, false);
    assert.equal(fixture.calls.some(([kind]) => kind === "rpc"), false);
  });
}
test("discount writes normalize codes, reject forged fields and scope the private RPC to an event", async () => {
  const fixture = setup({ rpcData: { discount: discountRow } });
  assert.equal((await fixture.actions.saveCommerceDiscountAdmin(eventId, { ...validDiscount, discountValue: 100 })).success, false);
  assert.equal((await fixture.actions.saveCommerceDiscountAdmin(eventId, { ...validDiscount, event_id: "another-event" })).success, false);
  assert.equal(fixture.calls.some(([kind]) => kind === "rpc"), false);
  assert.equal((await fixture.actions.saveCommerceDiscountAdmin(eventId, { ...validDiscount, code: " meraki20 " })).success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls.find(([kind]) => kind === "rpc").slice(1))), ["save_event_discount_code", { p_event_id: eventId, p_discount: validDiscount }]);
  const stats = setup({ rpcData: { discounts: [discountRow] } });
  const result = await stats.actions.loadCommerceDiscountsAdmin(eventId);
  assert.equal(result.success, true); assert.equal(result.discounts[0].reserved_uses, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(stats.calls.find(([kind]) => kind === "rpc").slice(1))), ["event_discount_code_stats", { p_event_id: eventId }]);
});
test("discount storage errors and missing acknowledgements are never reported as saved", async () => {
  for (const options of [{ rpcData: null }, { rpcData: { error: "invalid_target" } }, { rpcError: { code: "23505" } }]) {
    const result = await setup(options).actions.saveCommerceDiscountAdmin(eventId, validDiscount);
    assert.equal(result.success, false); assert.ok(result.error);
  }
});

async function discountEditorFixture({ config = validConfig, initialDiscounts = [] } = {}) {
  const { JSDOM } = await import("jsdom"); const React = await import("react");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://meraki.test", pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const saved = [];
  const component = load("../src/components/admin/discount-codes-editor.tsx", {
    "@/app/api/admin/commerce/actions": { saveCommerceDiscountAdmin: async (_id, discount) => { saved.push(JSON.parse(JSON.stringify(discount))); return { success: true, discount: discountRow }; }, loadCommerceDiscountsAdmin: async () => ({ success: true, discounts: [discountRow] }) },
    "@/lib/commerce/discounts": discountModule, "@/lib/commerce/rome-time": rome, "@/components/admin/wizard-steps": wizard,
  });
  const { createRoot } = await import("react-dom/client"); const root = createRoot(dom.window.document.getElementById("root"));
  await React.act(async () => root.render(React.createElement(component.DiscountCodesEditor, { eventId, config, initialDiscounts })));
  const document = dom.window.document;
  const click = async (text) => { const node = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text); assert.ok(node, `button ${text} exists`); await React.act(async () => node.click()); };
  const input = async (label, value) => { const node = [...document.querySelectorAll("label")].find((node) => node.textContent.startsWith(label))?.querySelector("input"); assert.ok(node, `input ${label} exists`); await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const select = async (label, value) => React.act(async () => { const node = document.querySelector(`select[aria-label='${label}']`); Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  return { dom, document, React, saved, click, input, select, async rerenderConfig(nextConfig) { await React.act(async () => root.render(React.createElement(component.DiscountCodesEditor, { eventId, config: nextConfig, initialDiscounts }))); }, async close() { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}
test("discount creation has three explicit stages and stores the targeted activity only at confirmation", async () => {
  const fixture = await discountEditorFixture();
  try {
    await fixture.click("Crea codice sconto");
    await fixture.click("Avanti");
    assert.equal(fixture.document.querySelector("[data-discount-step='0']").hidden, false);
    await fixture.input("Codice da condividere", "ws20"); await fixture.input("Nome interno", "Promo workshop"); await fixture.input("Percentuale", "20");
    await fixture.click("Avanti"); await fixture.select("Applica lo sconto a", "activity");
    await fixture.click("Avanti"); assert.equal(fixture.document.querySelector("[data-discount-step='1']").hidden, false, "selecting a target is required");
    const target = [...fixture.document.querySelectorAll("label")].find((node) => node.textContent.trim() === "Workshop").querySelector("input");
    await fixture.React.act(async () => target.click()); await fixture.click("Avanti");
    assert.equal(fixture.document.querySelector("[data-discount-step='2']").hidden, false); assert.equal(fixture.saved.length, 0);
    assert.match(fixture.document.body.textContent, /non si applica agli upgrade/);
    await fixture.click("Indietro"); assert.equal(target.checked, true); await fixture.click("Avanti"); await fixture.click("Salva codice sconto");
    assert.equal(fixture.saved.length, 1); assert.equal(fixture.saved[0].code, "WS20"); assert.deepEqual(fixture.saved[0].targetIds, ["ws"]); assert.equal(fixture.saved[0].discountValue, 20);
    assert.match(fixture.document.body.textContent, /Utilizzi confermati: 2/); assert.match(fixture.document.body.textContent, /Riservati: 1/);
  } finally { await fixture.close(); }
});
test("simple ticket events can create order discounts without exposing unavailable bundle targets", async () => {
  const fixture = await discountEditorFixture({ config: null });
  try {
    await fixture.click("Crea codice sconto"); await fixture.input("Codice da condividere", "TICKET10"); await fixture.input("Nome interno", "Promo evento"); await fixture.click("Avanti");
    assert.deepEqual([...fixture.document.querySelector("select[aria-label='Applica lo sconto a']").options].map((option) => option.value), ["order"]);
    const select = fixture.document.querySelector("select[aria-label='Applica lo sconto a']");
    const help = fixture.document.getElementById(select.getAttribute("aria-describedby"));
    assert.match(help.textContent, /salva la configurazione/); assert.match(help.textContent, /Salva bozza/);
    assert.equal(fixture.document.body.textContent.includes("Tutti gli scaglioni, compreso Early Bird"), false);
    await fixture.click("Avanti"); assert.equal(fixture.saved.length, 0); await fixture.click("Salva codice sconto");
    assert.equal(fixture.saved[0].targetType, "order");
  } finally { await fixture.close(); }
});

test("saved products in a disabled draft unlock their own discount categories and saved price tiers", async () => {
  const config = { ...validConfig, enabled: false, addons: [{ id: "extra-ws", name: "Ingresso aggiuntivo", activityId: "ws", amountCents: 500 }] };
  const fixture = await discountEditorFixture({ config });
  try {
    await fixture.click("Crea codice sconto"); await fixture.input("Codice da condividere", "DRAFT20"); await fixture.input("Nome interno", "Promozione preparata in bozza");
    await fixture.click("Avanti");
    assert.deepEqual([...fixture.document.querySelector("select[aria-label='Applica lo sconto a']").options].map((option) => option.value), ["order", "package", "activity", "addon"]);
    assert.equal(fixture.document.body.textContent.includes("Tutti gli scaglioni, compreso Early Bird"), true);
    await fixture.select("Applica lo sconto a", "activity");
    const target = [...fixture.document.querySelectorAll("label")].find((node) => node.textContent.trim() === "Workshop").querySelector("input");
    const allTiers = [...fixture.document.querySelectorAll("label")].find((node) => node.textContent.trim() === "Tutti gli scaglioni, compreso Early Bird").querySelector("input");
    await fixture.React.act(async () => { target.click(); allTiers.click(); });
    await fixture.click("Avanti"); assert.equal(fixture.saved.length, 0);
    await fixture.click("Salva codice sconto");
    assert.equal(fixture.saved.length, 1); assert.equal(fixture.saved[0].targetType, "activity");
    assert.deepEqual(fixture.saved[0].targetIds, ["ws"]); assert.deepEqual(fixture.saved[0].allowedTierIds, ["early"]);
    assert.equal(config.enabled, false, "preparing the promotion never enables or publishes the saved draft");
  } finally { await fixture.close(); }
});

test("discount categories reflect only saved collections and update without clearing the promotion draft", async () => {
  const fixture = await discountEditorFixture({ config: null });
  const categoryValues = () => [...fixture.document.querySelector("select[aria-label='Applica lo sconto a']").options].map((option) => option.value);
  try {
    await fixture.click("Crea codice sconto"); await fixture.input("Codice da condividere", "WAIT10"); await fixture.input("Nome interno", "Promozione in preparazione");
    await fixture.click("Avanti");
    assert.deepEqual(categoryValues(), ["order"]);
    const empty = { ...validConfig, enabled: false, activities: [], packages: [], addons: [] };
    await fixture.rerenderConfig(empty);
    assert.deepEqual(categoryValues(), ["order"]);
    assert.match(fixture.document.getElementById(fixture.document.querySelector("select[aria-label='Applica lo sconto a']").getAttribute("aria-describedby")).textContent, /Salva bozza/);
    await fixture.rerenderConfig({ ...validConfig, enabled: false, packages: [] });
    assert.deepEqual(categoryValues(), ["order", "activity"]);
    assert.equal(fixture.document.body.textContent.includes("Tutti gli scaglioni, compreso Early Bird"), false);
    await fixture.rerenderConfig(validConfig);
    assert.deepEqual(categoryValues(), ["order", "package", "activity"]);
    assert.equal(fixture.document.querySelector("select[aria-label='Applica lo sconto a']").hasAttribute("aria-describedby"), false);
    assert.equal(fixture.document.querySelector("[data-discount-step='1']").hidden, false);
    await fixture.click("Indietro");
    assert.equal([...fixture.document.querySelectorAll("label")].find((node) => node.textContent.startsWith("Codice da condividere")).querySelector("input").value, "WAIT10");
    assert.equal([...fixture.document.querySelectorAll("label")].find((node) => node.textContent.startsWith("Nome interno")).querySelector("input").value, "Promozione in preparazione");
    assert.equal(fixture.saved.length, 0, "receiving saved products never auto-saves the promotion");
  } finally { await fixture.close(); }
});

test("bundle allocation and translated content survive navigation and require an exact package sum", async () => {
  const fixture = await editorFixture();
  try {
    await fixture.click("Usa esempio WS + MC + cena"); await fixture.click("Avanti");
    const combo = [...fixture.panel(1).querySelectorAll("fieldset")].find((node) => node.firstElementChild?.textContent === "Formula 3");
    const customize = [...combo.querySelectorAll("button")].find((node) => node.textContent === "Personalizza ripartizione");
    await fixture.React.act(async () => customize.click());
    const amount = (label) => [...combo.querySelectorAll("label")].find((node) => node.textContent === label).querySelector("input");
    await fixture.input(amount("Workshop (€)"), "25"); await fixture.input(amount("Masterclass (€)"), "35");
    const name = combo.querySelector("[aria-label='Lingua · Nome formula']");
    await fixture.React.act(async () => [...name.querySelectorAll("button")].find((node) => node.textContent === "en").click());
    const translated = combo.querySelector("input[lang='en']"); await fixture.input(translated, "Workshop and masterclass");
    await fixture.click("Avanti"); await fixture.click("Avanti"); await fixture.click("Salva bozza");
    assert.equal(fixture.saved.length, 1); assert.deepEqual(fixture.saved[0].config.packages[2].prices[0].activityAmounts, { workshop: 2500, masterclass: 3500 }); assert.equal(fixture.saved[0].config.packages[2].nameTranslations.en, "Workshop and masterclass");
    await fixture.click("Modifica formule e prezzi"); await fixture.input(amount("Workshop (€)"), "24"); await fixture.click("Avanti");
    assert.equal(fixture.currentStep(), 1); assert.match(fixture.document.body.textContent, /ripartizione deve includere/);
  } finally { await fixture.close(); }
});

test("clearing optional Spanish translations removes their keys and saves the required Italian fallback", async () => {
  const fixture = await editorFixture();
  const clearTranslation = async (panel, label, text) => {
    const group = panel.querySelector(`[aria-label='Lingua · ${label}']`); assert.ok(group, `translation group ${label} exists`);
    await fixture.React.act(async () => [...group.querySelectorAll("button")].find((node) => node.textContent === "es").click());
    const control = group.parentElement.nextElementSibling;
    await fixture.input(control, text); assert.equal(control.value, text);
    await fixture.input(control, ""); assert.equal(control.value, "");
    await fixture.React.act(async () => [...group.querySelectorAll("button")].find((node) => node.textContent === "it").click());
    assert.ok(control.value, "the Italian source remains present");
  };
  try {
    await fixture.click("Usa esempio WS + MC + cena");
    await clearTranslation(fixture.panel(0), "Nome", "Taller");
    await fixture.click("Avanti");
    await clearTranslation(fixture.panel(1), "Nome formula", "Solo taller");
    await clearTranslation(fixture.panel(1), "Descrizione", "Entrada al taller");
    await clearTranslation(fixture.panel(1), "Etichetta", "Precio normal");
    await fixture.click("Avanti");
    await clearTranslation(fixture.panel(2), "Nome dell’aggiunta", "Añade la cena");
    await clearTranslation(fixture.panel(2), "Scelta 1", "Menú estándar");
    await fixture.click("Avanti"); await fixture.click("Salva bozza");
    assert.equal(fixture.saved.length, 1);
    const config = fixture.saved[0].config;
    assert.equal(config.activities[0].name, "Workshop"); assert.equal(config.activities[0].nameTranslations.es, undefined);
    assert.equal(config.packages[0].name, "Solo Workshop"); assert.equal(config.packages[0].nameTranslations.es, undefined);
    assert.equal(config.packages[0].description, "Accesso al workshop"); assert.equal(config.packages[0].descriptionTranslations.es, undefined);
    assert.equal(config.packages[0].prices[0].label, "Standard"); assert.equal(config.packages[0].prices[0].labelTranslations.es, undefined);
    assert.equal(config.addons[0].name, "Aggiungi la cena"); assert.equal(config.addons[0].nameTranslations.es, undefined);
    assert.equal(config.activities[2].menuOptions[0], "Standard"); assert.equal(config.activities[2].menuTranslations.Standard.es, undefined);
    assert.equal(configModule.configSchema.safeParse(config).success, true);
  } finally { await fixture.close(); }
});
