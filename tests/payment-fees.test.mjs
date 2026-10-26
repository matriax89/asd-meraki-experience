import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const reference = (overrides = {}) => ({ id: "order-1", paymentIntent: "pi_1", sessionId: "cs_1", amountCents: 10000, refundedCents: 0, ...overrides });
const transaction = (overrides = {}) => ({ id: "txn_1", amount: 10000, currency: "eur", fee: 175, fee_details: [{ amount: 175, type: "stripe_fee" }], ...overrides });
const charge = (overrides = {}) => ({ id: "ch_1", amount_captured: 10000, amount_refunded: 0, currency: "eur", paid: true, captured: true, payment_method_details: { type: "card" }, balance_transaction: transaction(), ...overrides });
const intent = (overrides = {}) => ({ id: "pi_1", currency: "eur", status: "succeeded", amount_received: 10000, latest_charge: charge(), ...overrides });
const refund = (overrides = {}) => ({ id: "re_1", currency: "eur", amount: 3000, status: "succeeded", balance_transaction: transaction({ id: "txn_refund", amount: -3000, fee: 0 }), ...overrides });

function fixture({ payment = intent(), refunds = { data: [], has_more: false }, session, balanceTransaction, failVerification = false, retrieve } = {}) {
  const calls = [];
  const assertOptions = options => { assert.equal(options.maxNetworkRetries, 0); assert.ok(options.timeout > 0 && options.timeout <= 4000); };
  const stripe = {
    paymentIntents: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["intent", id, params]); return retrieve ? retrieve(id) : payment; } },
    charges: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["charge", id, params]); return charge(); } },
    balanceTransactions: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["balance", id, params]); return balanceTransaction; } },
    checkout: { sessions: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["session", id, params]); return session; } } },
    refunds: { list: async (params, options) => { assertOptions(options); calls.push(["refunds", params]); return typeof refunds === "function" ? refunds(params) : refunds; } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/stripe/payment-fees.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Date, setTimeout, clearTimeout, require(name) {
    if (name === "server-only") return {};
    if (name === "./client") return { getVerifiedStripe: async () => { calls.push(["verify"]); if (failVerification) throw new Error("PRIVATE account mismatch"); return stripe; } };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { load: sandboxModule.exports.loadPaymentFees, calls };
}
const plain = value => JSON.parse(JSON.stringify(value));
const fees = async (setup, refs = [reference()]) => plain((await fixture(setup).load(refs)).get(refs[0].id));

test("actual captured card fee is read once and not added again from fee_details", async () => {
  const api = fixture();
  assert.deepEqual(plain((await api.load([reference()])).get("order-1")), { feeCents: 175, complete: true });
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "intent"]);
  assert.deepEqual(plain(api.calls[1][2]), { expand: ["latest_charge.balance_transaction"] });
});

test("PayPal settled on Stripe includes Stripe and PayPal fees already present in fee", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "paypal" }, balance_transaction: transaction({ fee: 400, fee_details: [{ amount: 100, type: "stripe_fee" }, { amount: 300, type: "payment_method_passthrough_fee" }] }) }) });
  assert.deepEqual(await fees({ payment }), { feeCents: 400, complete: true });
});

test("PayPal settled outside Stripe keeps known Stripe fee but marks PayPal fees missing", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 100 }) }) });
  assert.deepEqual(await fees({ payment }), { feeCents: 100, complete: false });
});

test("asynchronous capture, malformed balance fees and missing payment identities remain unavailable", async () => {
  for (const balance_transaction of [null, transaction({ fee: null }), transaction({ fee: NaN }), transaction({ fee: 1.5 })]) {
    assert.deepEqual(await fees({ payment: intent({ latest_charge: charge({ balance_transaction }) }) }), { feeCents: 0, complete: false });
  }
  const api = fixture();
  assert.deepEqual(plain((await api.load([reference({ paymentIntent: null, sessionId: null })])).get("order-1")), { feeCents: 0, complete: false });
  assert.equal(api.calls.length, 0);
});

test("API errors and account verification failure do not leak provider details or fabricate complete fees", async () => {
  assert.deepEqual(await fees({ retrieve: () => { throw new Error("PRIVATE token"); } }), { feeCents: 0, complete: false });
  assert.deepEqual(await fees({ failVerification: true }), { feeCents: 0, complete: false });
});

test("historic session-only references resolve their expanded PaymentIntent", async () => {
  const api = fixture({ session: { currency: "eur", amount_total: 10000, payment_status: "paid", payment_intent: intent() } });
  assert.deepEqual(plain((await api.load([reference({ paymentIntent: null })])).get("order-1")), { feeCents: 175, complete: true });
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "session"]);
  assert.deepEqual(await fees({ session: { currency: "usd", amount_total: 10000, payment_status: "paid", payment_intent: intent() } }, [reference({ paymentIntent: null })]), { feeCents: 0, complete: false });
});

test("non-expanded session intents and charge balance transactions are resolved with bounded requests", async () => {
  const api = fixture({ session: { currency: "eur", amount_total: 10000, payment_status: "paid", payment_intent: "pi_1" }, payment: intent({ latest_charge: charge({ balance_transaction: "txn_1" }) }), balanceTransaction: transaction() });
  assert.deepEqual(plain((await api.load([reference({ paymentIntent: null })])).get("order-1")), { feeCents: 175, complete: true });
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "session", "intent", "balance"]);
});

test("currency, captured amount and settlement mismatches cannot produce a misleading EUR net", async () => {
  const cases = [intent({ currency: "usd" }), intent({ status: "processing" }), intent({ amount_received: 9999 }), intent({ latest_charge: charge({ currency: "usd" }) }), intent({ latest_charge: charge({ captured: false }) }), intent({ latest_charge: charge({ amount_captured: 9999 }) }), intent({ latest_charge: charge({ balance_transaction: transaction({ currency: "usd" }) }) }), intent({ latest_charge: charge({ balance_transaction: transaction({ amount: 9999 }) }) })];
  for (const payment of cases) assert.deepEqual(await fees({ payment }), { feeCents: 0, complete: false });
});

test("a full refund keeps the original fee and adds only genuine refund fee credits", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 10000 }) });
  assert.deepEqual(await fees({ payment, refunds: { data: [refund({ amount: 10000, balance_transaction: transaction({ id: "txn_refund", amount: -10000, fee: 0 }) })], has_more: false } }, [reference({ refundedCents: 10000 })]), { feeCents: 175, complete: true });
  assert.deepEqual(await fees({ payment, refunds: { data: [refund({ amount: 10000, balance_transaction: transaction({ id: "txn_refund", amount: -10000, fee: -75 }) })], has_more: false } }, [reference({ refundedCents: 10000 })]), { feeCents: 100, complete: true });
});

test("all succeeded refunds are paged and each refund and balance transaction counts once", async () => {
  const api = fixture({ payment: intent({ latest_charge: charge({ amount_refunded: 6000 }) }), refunds: params => params.starting_after
    ? { data: [refund(), refund({ id: "re_2", balance_transaction: transaction({ id: "txn_refund_2", amount: -3000, fee: -25 }) })], has_more: false }
    : { data: [refund({ balance_transaction: transaction({ id: "txn_refund", amount: -3000, fee: -50 }) })], has_more: true } });
  assert.deepEqual(plain((await api.load([reference({ refundedCents: 6000 })])).get("order-1")), { feeCents: 100, complete: true });
  const calls = api.calls.filter(call => call[0] === "refunds");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].starting_after, "re_1");
});

test("pending or failed refunds do not change settled fees", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 3000 }) });
  const refunds = { data: [refund(), refund({ id: "re_pending", status: "pending", balance_transaction: transaction({ fee: -999 }) }), refund({ id: "re_failed", status: "failed" })], has_more: false };
  assert.deepEqual(await fees({ payment, refunds }, [reference({ refundedCents: 3000 })]), { feeCents: 175, complete: true });
});

test("missing refund balances or ledger disagreements preserve the charge fee and mark incomplete", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 3000 }) });
  for (const refunds of [{ data: [refund({ balance_transaction: null })], has_more: false }, { data: [], has_more: false }, () => { throw new Error("unavailable"); }]) {
    assert.deepEqual(await fees({ payment, refunds }, [reference({ refundedCents: 3000 })]), { feeCents: 175, complete: false });
  }
  assert.deepEqual(await fees({ payment, refunds: { data: [refund()], has_more: false } }), { feeCents: 175, complete: false });
});

test("duplicate payment and session aliases share one lookup while inconsistent aliases fail closed", async () => {
  const api = fixture();
  const result = await api.load([reference(), reference({ id: "order-2", paymentIntent: null }), reference({ id: "order-3" })]);
  assert.equal(api.calls.filter(call => call[0] === "intent").length, 1);
  for (const id of ["order-1", "order-2", "order-3"]) assert.deepEqual(plain(result.get(id)), { feeCents: 175, complete: true });
  const inconsistent = fixture();
  const rejected = await inconsistent.load([reference(), reference({ id: "other", amountCents: 50 })]);
  assert.deepEqual(plain(rejected.get("order-1")), { feeCents: 0, complete: false });
  assert.equal(inconsistent.calls.filter(call => call[0] === "intent").length, 0);
});

test("free orders never query Stripe and invalid reference amounts stay incomplete", async () => {
  const api = fixture();
  const result = await api.load([reference({ amountCents: 0 }), reference({ id: "bad", amountCents: -1 }), reference({ id: "too-refunded", refundedCents: 10001 })]);
  assert.deepEqual(plain(result.get("order-1")), { feeCents: 0, complete: true });
  assert.deepEqual(plain(result.get("bad")), { feeCents: 0, complete: false });
  assert.deepEqual(plain(result.get("too-refunded")), { feeCents: 0, complete: false });
  assert.equal(api.calls.length, 0);
});

test("provider requests run with at most four payments in flight", async () => {
  let active = 0; let maximum = 0;
  const api = fixture({ retrieve: async () => { active += 1; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active -= 1; return intent(); } });
  const results = await api.load(Array.from({ length: 13 }, (_, index) => reference({ id: `order-${index}`, paymentIntent: `pi_${index}`, sessionId: `cs_${index}` })));
  assert.equal(maximum, 4);
  assert.equal(results.size, 13);
  assert.ok([...results.values()].every(value => value.complete));
});
