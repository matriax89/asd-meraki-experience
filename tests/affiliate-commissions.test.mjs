import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { after } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const eventId = "10000000-0000-4000-8000-000000000001";
const affiliateId = "20000000-0000-4000-8000-000000000001";
const otherId = "20000000-0000-4000-8000-000000000002";
const eur = commissionCents => ({commissionType:"eur",commissionCents,commissionCredits:0});
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(code, { module: sandbox, exports: sandbox.exports, Intl, Object, Map, Set, document: globalThis.document, require: name => name in mocks ? mocks[name] : name === "@/lib/events/affiliate-commissions" ? domain : name === "@/components/admin/affiliate-commission-input" ? load("components/admin/affiliate-commission-input.tsx") : require(name) });
  return sandbox.exports;
}
const domain = load("lib/events/affiliate-commissions.ts");

test("commission euro input accepts decimal comma or dot, preserves cents and rejects malformed amounts", () => {
  for (const [input, cents] of [["5", 500], ["5,00", 500], ["5.5", 550], ["0,01", 1], ["0", 0], [" 12,34 ", 1234], ["100000", 10000000]]) assert.equal(domain.parseAffiliateCommissionEuro(input), cents);
  for (const input of ["", "-1", "1e3", ".5", "1.234,56", "5,005", "100000,01", "Infinity", "abc"]) assert.equal(domain.parseAffiliateCommissionEuro(input), null, input);
  assert.deepEqual(plain(domain.affiliateCommissionRatesSchema.parse({ [affiliateId.toUpperCase()]: 500, [otherId]: 0 })), { [affiliateId]: eur(500), [otherId]: eur(0) });
  for (const rates of [null, [], { notUuid: 500 }, { [affiliateId]: -1 }, { [affiliateId]: 1.5 }, { [affiliateId]: "500" }, { [affiliateId]: 10000001 }]) assert.equal(domain.affiliateCommissionRatesSchema.safeParse(rates).success, false);
});

test("credit compensation is whole, explicit and never confused with euro cents", () => {
  const credits={commissionType:"credits",commissionCents:0,commissionCredits:3};
  assert.deepEqual(plain(domain.normalizeAffiliateCommissionValue(500)),eur(500));
  assert.deepEqual(plain(domain.normalizeAffiliateCommissionValue(credits)),credits);
  assert.deepEqual(plain(domain.affiliateCommissionRatesSchema.parse({[affiliateId]:credits})),{[affiliateId]:credits});
  for(const input of ["0","3","1000000"," 12 "]) assert.equal(domain.parseAffiliateCommissionCredits(input),Number(input));
  for(const input of ["","1,5","1.5","-1","1e3","1000001"]) assert.equal(domain.parseAffiliateCommissionCredits(input),null);
  for(const value of [{commissionType:"credits",commissionCents:500,commissionCredits:1},{commissionType:"eur",commissionCredits:1},{commissionType:"credits",commissionCredits:1.5},{commissionType:"credits",commissionCredits:1000001},{commissionType:"other",commissionCents:0}]) assert.equal(domain.affiliateCommissionValueSchema.safeParse(value).success,false);
});

function actionFixture({ denied = false, rows = [{ affiliate_id: affiliateId, commission_cents: 500 }], eventExists = true, readError = false, rpcError = false } = {}) {
  const calls = []; const revalidated = []; let authorized = false;
  const db = {
    from(table) {
      assert.ok(authorized);
      const call = { table, filters: [] }; calls.push(call);
      return {
        select(fields) { call.fields = fields; return this; },
        eq(key, value) { call.filters.push([key, value]); return this; },
        maybeSingle() { return Promise.resolve({ data: eventExists ? { id: eventId } : null, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: readError ? null : rows, error: readError ? { message: "PRIVATE" } : null }).then(resolve, reject); },
      };
    },
    async rpc(name, args) { assert.ok(authorized); calls.push({ rpc: name, args }); return { error: rpcError ? { message: "PRIVATE" } : null }; },
  };
  const actions = load("app/api/admin/affiliati/commission-actions.ts", { "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => { if (denied) throw Error("Accesso negato"); authorized = true; return db; } }, "next/cache": { revalidatePath: (...args) => revalidated.push(args) } });
  return { ...actions, calls, revalidated };
}

test("commission reads and writes require staff before validation or private access", async () => {
  const api = actionFixture({ denied: true });
  await assert.rejects(api.loadEventAffiliateCommissions("invalid"), /Accesso negato/);
  await assert.rejects(api.saveEventAffiliateCommissions("invalid", {}), /Accesso negato/);
  assert.equal(api.calls.length, 0);
});

test("private commission reads validate the event, select only rates and distinguish unavailable from zero", async () => {
  const api = actionFixture();
  assert.deepEqual(plain(await api.loadEventAffiliateCommissions(eventId)), { success: true, rates: { [affiliateId]: eur(500) } });
  assert.deepEqual(api.calls[1], { table: "event_affiliate_commissions", fields: "affiliate_id,commission_type,commission_cents,commission_credits", filters: [["event_id", eventId]] });
  assert.deepEqual(plain(await actionFixture({ rows: [] }).loadEventAffiliateCommissions(eventId)), { success: true, rates: {} });
  for (const options of [{ readError: true }, { eventExists: false }, { rows: [{ affiliate_id: affiliateId, commission_cents: -1 }] }]) assert.equal((await actionFixture(options).loadEventAffiliateCommissions(eventId)).success, false);
  const invalid = actionFixture(); assert.equal((await invalid.loadEventAffiliateCommissions("bad")).success, false); assert.equal(invalid.calls.length, 0);
});

test("commission writes use the atomic private RPC and refresh all locale reports only on success", async () => {
  const api = actionFixture();
  assert.deepEqual(plain(await api.saveEventAffiliateCommissions(eventId, { [affiliateId]: 500, [otherId]: 0 })), { success: true });
  assert.deepEqual(plain(api.calls), [{ rpc: "set_event_affiliate_commissions", args: { p_event_id: eventId, p_rates: { [affiliateId]: eur(500), [otherId]: eur(0) } } }]);
  assert.ok(api.revalidated.some(([path]) => path === `/it/admin/eventi/${eventId}/statistiche`));
  assert.ok(api.revalidated.some(([path, kind]) => path === "/es/admin/affiliati" && kind === "layout"));
  const invalid = actionFixture(); assert.equal((await invalid.saveEventAffiliateCommissions(eventId, { [affiliateId]: "5" })).success, false); assert.equal(invalid.calls.length, 0);
  const failed = actionFixture({ rpcError: true }); const result = await failed.saveEventAffiliateCommissions(eventId, { [affiliateId]: 500 }); assert.equal(result.success, false); assert.doesNotMatch(result.error, /PRIVATE/); assert.equal(failed.revalidated.length, 0);
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const descriptors = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
const affiliates = [{ id: affiliateId, name: "Scuola Uno", active: true }, { id: otherId, name: "Scuola Due", active: false }];
async function mount(context, { initialRates = { [affiliateId]: 500 }, loadResult, saveResult = { success: true }, loadError } = {}) {
  const saves = []; let refreshes = 0;
  const { AffiliateCommissionsEditor } = load("components/admin/affiliate-commissions-editor.tsx", { "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) }, "@/app/api/admin/affiliati/commission-actions": { loadEventAffiliateCommissions: async () => loadResult, saveEventAffiliateCommissions: async (...args) => { saves.push(args); return typeof saveResult === "function" ? saveResult(...args) : saveResult; } } });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let props = { eventId, affiliates, initialRates, loadError };
  const rerender = async next => { props = { ...props, ...next }; await act(async () => root.render(React.createElement(AffiliateCommissionsEditor, props))); };
  await rerender({});
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const change = async (index, value) => { const input = host.querySelectorAll("input[inputmode]")[index]; await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const unit = async (index, value) => act(async () => host.querySelectorAll("fieldset")[index].querySelector(`input[value="${value}"]`).click());
  const submit = async () => act(async () => host.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  return { host, saves, change, unit, submit, rerender, refreshes: () => refreshes };
}

test("staff editor saves distinct euro amounts per affiliate including zero and explains one payout per person", async context => {
  const ui = await mount(context);
  assert.deepEqual([...ui.host.querySelectorAll("input[inputmode]")].map(input => input.value), ["5,00", "0,00"]);
  assert.match(ui.host.textContent, /Ogni persona conta una volta/);
  assert.match(ui.host.textContent, /Disattivato per nuovi acquisti/);
  await ui.change(0, "7,25"); await ui.change(1, "0"); await ui.submit();
  assert.deepEqual(plain(ui.saves), [[eventId, { [affiliateId]: eur(725), [otherId]: eur(0) }]]);
  assert.equal(ui.refreshes(), 1); assert.match(ui.host.querySelector('[role="status"]').textContent, /Compensi salvati/);
});

test("invalid euro input never reaches the save action and a failed save retains the draft", async context => {
  const ui = await mount(context, { saveResult: { success: false, error: "Salvataggio non riuscito" } });
  await ui.change(0, "5,005"); await ui.submit(); assert.equal(ui.saves.length, 0); assert.match(ui.host.querySelector('[role="alert"]').textContent, /due decimali/);
  await ui.change(0, "6,50"); await ui.submit(); assert.equal(ui.saves.length, 1); assert.equal(ui.host.querySelector("input[inputmode]").value, "6,50"); assert.equal(ui.refreshes(), 0);
});

test("unavailable saved commissions do not become zero and can be reloaded before editing", async context => {
  const ui = await mount(context, { initialRates: null, loadError: "Compensi non disponibili", loadResult: { success: true, rates: { [affiliateId]: 900 } } });
  assert.equal(ui.host.querySelectorAll("input").length, 0);
  await act(async () => [...ui.host.querySelectorAll("button")].find(button => button.textContent === "Ricarica compensi").click());
  assert.equal(ui.host.querySelector("input[inputmode]").value, "9,00"); assert.equal(ui.host.querySelector('[role="alert"]'), null);
});

test("editor saves mixed euro and credit compensation as explicit units and never converts amounts", async context => {
  const credits = commissionCredits => ({ commissionType: "credits", commissionCents: 0, commissionCredits });
  const ui = await mount(context, { initialRates: { [affiliateId]: eur(750), [otherId]: credits(4) } });
  assert.deepEqual([...ui.host.querySelectorAll("input[inputmode]")].map(input => [input.inputMode, input.value]), [["decimal", "7,50"], ["numeric", "4"]]);
  await ui.unit(0, "credits"); assert.equal(ui.host.querySelector("input[inputmode]").value, "0");
  await ui.change(0, "3");
  await ui.unit(0, "eur"); assert.equal(ui.host.querySelector("input[inputmode]").value, "7,50");
  await ui.unit(0, "credits"); assert.equal(ui.host.querySelector("input[inputmode]").value, "3");
  await ui.unit(1, "eur"); await ui.change(1, "9,25"); await ui.submit();
  assert.deepEqual(plain(ui.saves), [[eventId, { [affiliateId]: credits(3), [otherId]: eur(925) }]]);
  assert.equal(ui.refreshes(), 1);
});

test("editor rejects invalid whole credits with a focused labeled input and preserves credit drafts on save errors", async context => {
  const ui = await mount(context, { saveResult: { success: false, error: "Riprova il salvataggio" } });
  await ui.unit(0, "credits");
  for (const invalid of ["1,5", "1.5", "-1", "1000001", "1e3"]) {
    await ui.change(0, invalid); await ui.submit();
    assert.equal(ui.saves.length, 0); assert.match(ui.host.querySelector('[role="alert"]').textContent, /numero intero/);
    const input = ui.host.querySelector("input[inputmode]");
    assert.equal(input.getAttribute("aria-invalid"), "true"); assert.equal(document.activeElement, input);
    assert.ok(ui.host.querySelector(`label[for="${input.id}"]`).textContent.includes("crediti"));
  }
  await ui.change(0, "0"); await ui.submit();
  assert.equal(ui.saves.length, 1); assert.equal(ui.saves[0][1][affiliateId].commissionCredits, 0);
  assert.equal(ui.saves[0][1][affiliateId].commissionType, "credits");
  assert.equal(ui.host.querySelector("input[inputmode]").value, "0"); assert.equal(ui.refreshes(), 0);
});

test("editor reload preserves explicit credit amounts instead of interpreting them as euro cents", async context => {
  const ui = await mount(context, { initialRates: null, loadResult: { success: true, rates: { [affiliateId]: { commissionType: "credits", commissionCents: 0, commissionCredits: 18 }, [otherId]: eur(625) } } });
  await act(async () => [...ui.host.querySelectorAll("button")].find(button => button.textContent === "Ricarica compensi").click());
  assert.deepEqual([...ui.host.querySelectorAll("input[inputmode]")].map(input => [input.inputMode, input.value]), [["numeric", "18"], ["decimal", "6,25"]]);
});

test("same editor instance reads newly associated affiliate credit defaults after refresh and keeps unsaved existing amounts", async context => {
  const ui = await mount(context);
  await ui.change(0, "8,25");
  const addedId = "20000000-0000-4000-8000-000000000003";
  const newCreditRate = { commissionType: "credits", commissionCents: 0, commissionCredits: 12 };
  await ui.rerender({ affiliates: [...affiliates, { id: addedId, name: "Nuova Scuola", active: true }], initialRates: { [affiliateId]: eur(500), [otherId]: eur(0), [addedId]: newCreditRate } });
  assert.deepEqual([...ui.host.querySelectorAll("input[inputmode]")].map(input => [input.inputMode, input.value]), [["decimal", "8,25"], ["decimal", "0,00"], ["numeric", "12"]]);
  await ui.submit();
  assert.deepEqual(plain(ui.saves), [[eventId, { [affiliateId]: eur(825), [otherId]: eur(0), [addedId]: newCreditRate }]]);
});
