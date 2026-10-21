import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
function load(path, mocks, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name === "server-only" ? {} : name in mocks ? mocks[name] : require(name), process: { env }, Date, URL, Request, Response, crypto, console }, { filename: path });
  return compiledModule.exports;
}
const base = { id: "refund-1", event_id: "event-1", order_id: "order-1", ticket_reservation_id: null, payment_intent: "pi_one", amount_cents: 2000, reason: "Rinuncia al workshop", status: "preparing", stripe_refund_id: null, revoke_entitlement_ids: [], created_at: new Date().toISOString(), email_sent_at: null };
function setup({ status = "succeeded", createError, mailSuccess = true, completeError = false, ownRights = [], remainingRights = [], people = [] } = {}) {
  let row = { ...base };
  const calls = [];
  function query(table) {
    let byOrder = false;
    return { select() { return this; }, eq(column) { if (column === "order_id") byOrder = true; return this; }, in() { return this; }, order() { return this; },
      async single() { return { data: table === "meraki_refunds" ? row : table === "events" ? { titolo: { it: "Evento" } } : { buyer_email: "buyer@example.test", locale: "it", amount_cents: 6500, stripe_payment_intent: "pi_one" } }; },
      async maybeSingle() { return { data: row }; },
      then(resolve) { resolve({ data: table === "commerce_entitlements" ? byOrder ? ownRights : remainingRights : table === "commerce_passes" ? people : [] }); } };
  }
  const db = { from: query, async rpc(name, args) {
    calls.push([name, plain(args)]);
    if (name === "claim_meraki_refund_email") return { data: true };
    if (name === "reserve_meraki_refund") return { data: row };
    if (name === "complete_meraki_refund") {
      if (completeError && args.p_status === "succeeded") return { error: { code: "offline" } };
      row = { ...row, stripe_refund_id: args.p_stripe_refund_id, status: args.p_status, failure_reason: args.p_failure_reason };
      return { data: row };
    }
    return { data: null };
  } };
  const stripe = {
    refunds: {
      list() { return { async *[Symbol.asyncIterator]() {} }; },
      async create(params, options) { calls.push(["stripe.create", plain(params), plain(options)]); if (createError) throw createError; return { id: "re_one", amount: params.amount, currency: "eur", status, payment_intent: params.payment_intent, metadata: params.metadata }; },
      async retrieve(id) { calls.push(["stripe.retrieve", id]); return { id, amount: row.amount_cents, currency: "eur", status, payment_intent: row.payment_intent, metadata: { meraki_refund_id: row.id } }; },
    }, paymentIntents: { async retrieve() { return { status: "succeeded", currency: "eur", amount_received: 6500 }; } },
  };
  const service = load("src/lib/refunds/service.ts", {
    "@/lib/stripe/client": { getVerifiedStripe: async () => stripe }, "@/lib/commerce/server": { commerceClient: () => db },
    "@/lib/i18n-utils": { getLocalizedText: title => title.it }, "./data": {},
    "@/lib/email/refund-emails": { async sendMerakiRefundConfirmation(input) { calls.push(["email", input]); return { success: mailSuccess }; }, async sendMerakiCancellationNotice() { throw Error("No cancellation email expected"); } },
  });
  return { service, calls, db, get row() { return row; }, set row(value) { row = value; } };
}

test("panel refunds use exact cents, separate metadata and stable idempotency", async () => {
  const ctx = setup();
  const result = await ctx.service.executeMerakiRefund(base, ctx.db);
  assert.equal(result.status, "succeeded");
  const call = ctx.calls.find(call => call[0] === "stripe.create");
  assert.equal(call[1].amount, 2000);
  assert.deepEqual(call[1].metadata, { meraki_refund_id: "refund-1", meraki_event_id: "event-1" });
  assert.equal(call[2].idempotencyKey, "meraki-panel-refund-refund-1");
  assert.equal(ctx.calls.filter(call => call[0] === "email").length, 1);
  assert.ok(ctx.calls.findIndex(call => call[0] === "complete_meraki_refund") < ctx.calls.findIndex(call => call[0] === "email"));
});

for (const status of ["pending", "requires_action", "failed", "canceled"]) test(`${status} refunds never send a success email`, async () => {
  const ctx = setup({ status });
  assert.equal((await ctx.service.executeMerakiRefund(base, ctx.db)).status, status);
  assert.equal(ctx.calls.some(call => call[0] === "email"), false);
});

test("uncertain network failures hold the amount and do not report failure", async () => {
  const ctx = setup({ createError: { type: "StripeConnectionError" } });
  assert.equal((await ctx.service.executeMerakiRefund(base, ctx.db)).status, "unknown");
  assert.equal(ctx.calls.some(call => call[0] === "email"), false);
});

test("a definite provider rejection releases the request as failed", async () => {
  const ctx = setup({ createError: { type: "StripeInvalidRequestError" } });
  assert.equal((await ctx.service.executeMerakiRefund(base, ctx.db)).status, "failed");
});

test("database failure after Stripe acceptance never becomes a failed refund", async () => {
  const ctx = setup({ completeError: true });
  await assert.rejects(ctx.service.executeMerakiRefund(base, ctx.db), /non registrato/);
  assert.equal(ctx.calls.some(call => call[0] === "complete_meraki_refund" && call[1].p_status === "failed"), false);
});

test("email failure retains the succeeded payment and retry does not refund twice", async () => {
  const ctx = setup({ mailSuccess: false });
  assert.equal((await ctx.service.executeMerakiRefund(base, ctx.db)).status, "succeeded");
  assert.equal(ctx.row.status, "succeeded");
  assert.equal((await ctx.service.executeMerakiRefund(ctx.row, ctx.db)).status, "succeeded");
  assert.equal(ctx.calls.filter(call => call[0] === "stripe.create").length, 1);
});

test("known pending refund is retrieved instead of creating a second one", async () => {
  const ctx = setup();
  ctx.row = { ...base, status: "pending", stripe_refund_id: "re_one" };
  assert.equal((await ctx.service.executeMerakiRefund(ctx.row, ctx.db)).status, "succeeded");
  assert.equal(ctx.calls.some(call => call[0] === "stripe.create"), false);
  assert.equal(ctx.calls.some(call => call[0] === "stripe.retrieve"), true);
});

test("group refund emails distinguish people whose identically named access is revoked or retained", async () => {
  const ctx = setup({ ownRights: [{ id: "right-1", pass_id: "pass-1", activity_name: "Workshop" }, { id: "right-2", pass_id: "pass-2", activity_name: "Workshop" }],
    remainingRights: [{ pass_id: "pass-2", activity_name: "Workshop" }],
    people: [{ id: "pass-1", first_name: "Ada", last_name: "Rossi" }, { id: "pass-2", first_name: "Luca", last_name: "Bianchi" }] });
  ctx.row = { ...base, revoke_entitlement_ids: ["right-1"] };
  await ctx.service.executeMerakiRefund(ctx.row, ctx.db);
  const input = ctx.calls.find(call => call[0] === "email")[1];
  assert.deepEqual(plain(input.revokedAccessNames), ["Workshop · Ada Rossi"]);
  assert.deepEqual(plain(input.remainingAccessNames), ["Workshop · Luca Bianchi"]);
});

test("expired uncertain idempotency requests require operator reconciliation", async () => {
  const ctx = setup();
  ctx.row = { ...base, status: "unknown", created_at: new Date(Date.now() - 25 * 3600000).toISOString() };
  await assert.rejects(ctx.service.executeMerakiRefund(ctx.row, ctx.db), /precedente da verificare/);
  assert.equal(ctx.calls.some(call => call[0] === "stripe.create"), false);
});

test("webhook identity, amount and currency must match the frozen request", async () => {
  for (const mismatch of [{ amount: 1 }, { currency: "usd" }, { payment_intent: "pi_other" }]) {
    const ctx = setup();
    await assert.rejects(ctx.service.syncMerakiRefund({ id: "re_one", amount: 2000, currency: "eur", payment_intent: "pi_one", status: "succeeded", metadata: { meraki_refund_id: base.id }, ...mismatch }, ctx.db), /non corrisponde/);
    assert.equal(ctx.calls.length, 0);
  }
});

test("only admins can manage refunds, while editors can read", async () => {
  for (const role of ["admin", "editor", "member"]) {
    const auth = load("src/lib/refunds/auth.ts", { "@/lib/commerce/server": { commerceClient: () => ({ private: true }) }, "@/lib/supabase/server": {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user" } } }) } }),
      createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }) }),
    } });
    if (role === "member") await assert.rejects(auth.requireRefundAccess(), /amministratore/);
    else assert.equal((await auth.requireRefundAccess()).canManage, role === "admin");
    if (role === "admin") assert.equal((await auth.requireRefundAccess(true)).userId, "user");
    else await assert.rejects(auth.requireRefundAccess(true), /amministratore/);
  }
});

test("refund writes reject absent and cross-origin requests", () => {
  const auth = load("src/lib/refunds/auth.ts", { "@/lib/commerce/server": {}, "@/lib/supabase/server": {} });
  for (const origin of [null, "https://evil.example"]) assert.throws(() => auth.requireRefundOrigin(new Request("https://meraki.example/api/admin/refunds", { headers: origin ? { origin } : {} })), /non consentita/);
  assert.doesNotThrow(() => auth.requireRefundOrigin(new Request("https://meraki.example/api/admin/refunds", { headers: { origin: "https://meraki.example" } })));
});

test("reconciled partial refunds bypass the legacy full-refund handlers even with copied metadata", async () => {
  const calls = [];
  const route = load("src/app/api/webhook/stripe/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/i18n-utils": {},
    "@/lib/stripe/client": { getStripe: () => ({ webhooks: { constructEvent: () => ({ type: "refund.updated", data: { object: { id: "re_partial", amount: 1000, status: "succeeded", metadata: { meraki_commerce_order_id: "order-1" } } } }) } }) },
    "@/lib/refunds/service": { syncMerakiRefund: async () => { calls.push("ledger"); return true; } },
    "@/lib/stripe/fulfill-ticket": { updateTicketRefund: async () => calls.push("legacy-full") },
    "@/lib/stripe/commerce": { updateCommerceRefund: async () => calls.push("commerce-full") },
    "@/lib/stripe/ticket-status": {}, "@/lib/supabase/server": {}, "@/lib/resend/client": {},
  }, { STRIPE_WEBHOOK_SECRET: "test-only" });
  const response = await route.POST(new Request("https://meraki.example/api/webhook/stripe", { method: "POST", headers: { "stripe-signature": "test" }, body: "{}" }));
  // This source loader has no real keys, network, database or email provider.
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["ledger"]);
});
