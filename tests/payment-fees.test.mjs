import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const reference = (overrides = {}) => ({ id: "order-1", paymentIntent: "pi_1", sessionId: "cs_1", amountCents: 10000, refundedCents: 0, ...overrides });
const transaction = (overrides = {}) => {
  const value = { id: "txn_1", amount: 10000, currency: "eur", fee: 175, fee_details: [{ amount: 175, type: "stripe_fee" }], ...overrides };
  return { net: value.amount - value.fee, ...value };
};
const charge = (overrides = {}) => ({ id: "ch_1", amount_captured: 10000, amount_refunded: 0, currency: "eur", paid: true, captured: true, payment_method_details: { type: "card" }, balance_transaction: transaction(), ...overrides });
const intent = (overrides = {}) => ({ id: "pi_1", currency: "eur", status: "succeeded", amount_received: 10000, latest_charge: charge(), ...overrides });
const refund = (overrides = {}) => ({ id: "re_1", currency: "eur", amount: 3000, status: "succeeded", balance_transaction: transaction({ id: "txn_refund", amount: -3000, fee: 0 }), ...overrides });

const rateCode = ts.transpileModule(readFileSync(new URL("../src/lib/stripe/payment-fee-rates.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const rateModule = { exports: {} };
vm.runInNewContext(rateCode, { module: rateModule, exports: rateModule.exports });
const rates = rateModule.exports;
const cardFee = (feeCents = 175, complete = true) => ({ feeCents, complete, channel: "stripe_online" });

function fixture({ payment = intent(), refunds = { data: [], has_more: false }, session, balanceTransaction, failVerification = false, retrieve, reader, failReader = false } = {}) {
  const calls = [];
  const assertOptions = options => { assert.equal(options.maxNetworkRetries, 0); assert.ok(options.timeout > 0 && options.timeout <= 4000); };
  const stripe = {
    paymentIntents: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["intent", id, params]); return retrieve ? retrieve(id) : payment; } },
    charges: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["charge", id, params]); return charge(); } },
    balanceTransactions: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["balance", id, params]); return balanceTransaction; } },
    checkout: { sessions: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["session", id, params]); return session; } } },
    refunds: { list: async (params, options) => { assertOptions(options); calls.push(["refunds", params]); return typeof refunds === "function" ? refunds(params) : refunds; } },
    terminal: { readers: { retrieve: async (id, params, options) => { assertOptions(options); calls.push(["reader", id, params]); if (failReader) throw new Error("Reader unavailable"); return reader; } } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/stripe/payment-fees.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Date, setTimeout, clearTimeout, require(name) {
    if (name === "server-only") return {};
    if (name === "./client") return { getVerifiedStripe: async () => { calls.push(["verify"]); if (failVerification) throw new Error("PRIVATE account mismatch"); return stripe; } };
    if (name === "./payment-fee-rates") return rates;
    throw new Error(`Unexpected import ${name}`);
  } });
  return { load: sandboxModule.exports.loadPaymentFees, calls };
}
const plain = value => JSON.parse(JSON.stringify(value));
const fees = async (setup, refs = [reference()]) => plain((await fixture(setup).load(refs)).get(refs[0].id));

test("actual captured card fee is read once and not added again from fee_details", async () => {
  const api = fixture();
  assert.deepEqual(plain((await api.load([reference()])).get("order-1")), cardFee());
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "intent"]);
  assert.deepEqual(plain(api.calls[1][2]), { expand: ["latest_charge.balance_transaction"] });
});

test("PayPal settled on Stripe includes Stripe and PayPal fees already present in fee", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "paypal" }, balance_transaction: transaction({ fee: 400, fee_details: [{ amount: 100, type: "stripe_fee" }, { amount: 300, type: "payment_method_passthrough_fee" }] }) }) });
  assert.deepEqual(await fees({ payment }), { feeCents: 400, complete: true, channel: "paypal" });
});

test("the merchant's 65 EUR PayPal example includes Stripe, Radar and PayPal exactly once", async () => {
  const ref = reference({ amountCents: 6500 });
  const payment = intent({ amount_received: 6500, latest_charge: charge({ amount_captured: 6500, payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 6500, fee: 284, fee_details: [
    { amount: 23, type: "stripe_fee", description: "Processing" },
    { amount: 5, type: "stripe_fee", description: "Radar Standard" },
    { amount: 256, type: "payment_method_passthrough_fee", description: "PayPal fees" },
  ] }) }) });
  const actual = await fees({ payment }, [ref]);
  assert.deepEqual(actual, { feeCents: 284, complete: true, channel: "paypal" });
  assert.equal(ref.amountCents - actual.feeCents, 6216);
  const external = intent({ ...payment, latest_charge: { ...payment.latest_charge, balance_transaction: transaction({ amount: 0, fee: 28, fee_details: [
    { amount: 23, type: "stripe_fee", description: "Processing" },
    { amount: 5, type: "stripe_fee", description: "Radar Standard" },
  ] }) } });
  const estimated = await fees({ payment: external }, [ref]);
  assert.equal(estimated.complete, false);
  assert.equal(estimated.feeCents, 28);
  assert.equal(estimated.estimatedFeeCents, 256, "only the missing PayPal portion is estimated");
  assert.equal(ref.amountCents - estimated.feeCents - estimated.estimatedFeeCents, 6216);
});

test("the merchant's 65 EUR Link, Tap to Pay and online card examples preserve the actual fees and net", async () => {
  for (const sample of [
    { details: { type: "link" }, feeCents: 128, netCents: 6372, channel: "stripe_online", parts: [123, 5] },
    { details: { type: "card_present", card_present: { reader: "tmr_phone" } }, feeCents: 101, netCents: 6399, channel: "stripe_tap_to_pay", parts: [101] },
    { details: { type: "card" }, feeCents: 128, netCents: 6372, channel: "stripe_online", parts: [123, 5] },
  ]) {
    const payment = intent({ amount_received: 6500, latest_charge: charge({ amount_captured: 6500, payment_method_details: sample.details, balance_transaction: transaction({ amount: 6500, fee: sample.feeCents, fee_details: sample.parts.map(amount => ({ amount, type: "stripe_fee" })) }) }) });
    const actual = await fees({ payment, reader: { device_type: "mobile_phone_reader" } }, [reference({ amountCents: 6500 })]);
    assert.deepEqual(actual, { feeCents: sample.feeCents, complete: true, channel: sample.channel });
    assert.equal(6500 - actual.feeCents, sample.netCents);
    assert.equal(actual.estimatedFeeCents, undefined, "known actual fees override all tariff estimates and authorization assumptions");
  }
});

test("Adaptive Pricing with PLN presentment uses the actual EUR fee and preserves the 85 EUR to 81.37 EUR example", async () => {
  // The local amount is synthetic: it must never replace the EUR order total
  // or be used to reconstruct an exchange rate for commission reporting.
  const presentment_details = { presentment_currency: "pln", presentment_amount: 40000 };
  const payment = intent({ amount_received: 8500, presentment_details, latest_charge: charge({ amount_captured: 8500, presentment_details, payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 8500, fee: 363, net: 8137, fee_details: [] }) }) });
  for (const paymentIntent of ["pi_1", null]) {
    const actual = await fees({ payment, session: { currency: "eur", amount_total: 8500, payment_status: "paid", presentment_details, payment_intent: payment } }, [reference({ amountCents: 8500, paymentIntent })]);
    assert.deepEqual(actual, { feeCents: 363, complete: true, channel: "paypal" });
    assert.equal(8500 - actual.feeCents, 8137);
  }
});

test("missing PayPal fees with foreign presentment remain unverified instead of using an EUR tariff estimate", async () => {
  const presentment_details = { presentment_currency: "pln", presentment_amount: 40000 };
  for (const source of ["intent", "charge", "session"]) {
    const payment = intent({ amount_received: 8500, ...(source === "intent" ? { presentment_details } : {}), latest_charge: charge({ amount_captured: 8500, ...(source === "charge" ? { presentment_details } : {}), payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 32, net: -32 }) }) });
    const actual = await fees({ payment, session: { currency: "eur", amount_total: 8500, payment_status: "paid", presentment_details, payment_intent: payment } }, [reference({ amountCents: 8500, paymentIntent: source === "session" ? null : "pi_1" })]);
    assert.deepEqual(actual, { feeCents: 32, complete: false, channel: "paypal" });
  }
});

test("settlement fees must reconcile with their EUR balance net before any complete net is reported", async () => {
  for (const net of [undefined, null, NaN, 8137.5, 8468]) {
    const payment = intent({ amount_received: 8500, latest_charge: charge({ amount_captured: 8500, payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 8500, fee: 363, net }) }) });
    assert.deepEqual(await fees({ payment }, [reference({ amountCents: 8500 })]), { feeCents: 0, complete: false, channel: "paypal" });
  }
});

test("PayPal settled outside Stripe keeps known Stripe fee but marks PayPal fees missing", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 100 }) }) });
  const result = await fees({ payment });
  assert.equal(result.feeCents, 100);
  assert.equal(result.complete, false);
  assert.equal(result.channel, "paypal");
  assert.equal(result.estimatedFeeCents, 375, "the PayPal estimate is incremental; the known Stripe fee is not added again");
  assert.ok(result.estimateReason.includes("3,4% + 0,35 €"));
});

test("asynchronous capture, malformed balance fees and missing payment identities remain unavailable", async () => {
  for (const balance_transaction of [null, transaction({ fee: null }), transaction({ fee: NaN }), transaction({ fee: 1.5 })]) {
    assert.deepEqual(await fees({ payment: intent({ latest_charge: charge({ balance_transaction }) }) }), cardFee(0, false));
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
  assert.deepEqual(plain((await api.load([reference({ paymentIntent: null })])).get("order-1")), cardFee());
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "session"]);
  assert.deepEqual(await fees({ session: { currency: "usd", amount_total: 10000, payment_status: "paid", payment_intent: intent() } }, [reference({ paymentIntent: null })]), { feeCents: 0, complete: false });
});

test("non-expanded session intents and charge balance transactions are resolved with bounded requests", async () => {
  const api = fixture({ session: { currency: "eur", amount_total: 10000, payment_status: "paid", payment_intent: "pi_1" }, payment: intent({ latest_charge: charge({ balance_transaction: "txn_1" }) }), balanceTransaction: transaction() });
  assert.deepEqual(plain((await api.load([reference({ paymentIntent: null })])).get("order-1")), cardFee());
  assert.deepEqual(api.calls.map(call => call[0]), ["verify", "session", "intent", "balance"]);
});

test("currency, captured amount and settlement mismatches cannot produce a misleading EUR net", async () => {
  const cases = [intent({ currency: "usd" }), intent({ status: "processing" }), intent({ amount_received: 9999 }), intent({ latest_charge: charge({ currency: "usd" }) }), intent({ latest_charge: charge({ captured: false }) }), intent({ latest_charge: charge({ amount_captured: 9999 }) })];
  for (const payment of cases) assert.deepEqual(await fees({ payment }), { feeCents: 0, complete: false });
  for (const balance_transaction of [transaction({ currency: "usd" }), transaction({ amount: 9999 })]) assert.deepEqual(await fees({ payment: intent({ latest_charge: charge({ balance_transaction }) }) }), cardFee(0, false));
});

test("a full refund keeps the original fee and adds only genuine refund fee credits", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 10000 }) });
  assert.deepEqual(await fees({ payment, refunds: { data: [refund({ amount: 10000, balance_transaction: transaction({ id: "txn_refund", amount: -10000, fee: 0 }) })], has_more: false } }, [reference({ refundedCents: 10000 })]), cardFee());
  assert.deepEqual(await fees({ payment, refunds: { data: [refund({ amount: 10000, balance_transaction: transaction({ id: "txn_refund", amount: -10000, fee: -75 }) })], has_more: false } }, [reference({ refundedCents: 10000 })]), cardFee(100));
});

test("all succeeded refunds are paged and each refund and balance transaction counts once", async () => {
  const api = fixture({ payment: intent({ latest_charge: charge({ amount_refunded: 6000 }) }), refunds: params => params.starting_after
    ? { data: [refund(), refund({ id: "re_2", balance_transaction: transaction({ id: "txn_refund_2", amount: -3000, fee: -25 }) })], has_more: false }
    : { data: [refund({ balance_transaction: transaction({ id: "txn_refund", amount: -3000, fee: -50 }) })], has_more: true } });
  assert.deepEqual(plain((await api.load([reference({ refundedCents: 6000 })])).get("order-1")), cardFee(100));
  const calls = api.calls.filter(call => call[0] === "refunds");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].starting_after, "re_1");
});

test("pending or failed refunds do not change settled fees", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 3000 }) });
  const refunds = { data: [refund(), refund({ id: "re_pending", status: "pending", balance_transaction: transaction({ fee: -999 }) }), refund({ id: "re_failed", status: "failed" })], has_more: false };
  assert.deepEqual(await fees({ payment, refunds }, [reference({ refundedCents: 3000 })]), cardFee());
});

test("missing refund balances or ledger disagreements preserve the charge fee and mark incomplete", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 3000 }) });
  for (const refunds of [{ data: [refund({ balance_transaction: null })], has_more: false }, { data: [], has_more: false }, () => { throw new Error("unavailable"); }]) {
    assert.deepEqual(await fees({ payment, refunds }, [reference({ refundedCents: 3000 })]), cardFee(175, false));
  }
  assert.deepEqual(await fees({ payment, refunds: { data: [refund()], has_more: false } }), cardFee(175, false));
});

test("duplicate payment and session aliases share one lookup while inconsistent aliases fail closed", async () => {
  const api = fixture();
  const result = await api.load([reference(), reference({ id: "order-2", paymentIntent: null }), reference({ id: "order-3" })]);
  assert.equal(api.calls.filter(call => call[0] === "intent").length, 1);
  for (const id of ["order-1", "order-2", "order-3"]) assert.deepEqual(plain(result.get(id)), cardFee());
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

test("manual Tap to Pay receipts estimate the original captured payment without contacting Stripe", async () => {
  const api = fixture({ failVerification: true });
  const refs = [
    reference({ paymentMethod: "pos", paymentIntent: null, sessionId: null, amountCents: 6500, refundedCents: 2000 }),
    reference({ id: "full-refund", paymentMethod: "pos", paymentIntent: null, sessionId: null, amountCents: 6500, refundedCents: 6500 }),
  ];
  const result = await api.load(refs);
  for (const ref of refs) {
    const fee = result.get(ref.id);
    assert.equal(fee.feeCents, 0);
    assert.equal(fee.complete, false);
    assert.equal(fee.channel, "stripe_tap_to_pay");
    assert.equal(fee.estimatedFeeCents, 111, "1.4% of the original €65, plus €0.10 processing and one €0.10 authorization");
    assert.ok(fee.estimateReason.includes("carta SEE"));
    assert.ok(fee.estimateReason.includes("ulteriori tentativi"));
  }
  assert.equal(api.calls.length, 0);
});

test("standard tariff estimates round once per payment and do not apply fixed fees to free orders", () => {
  assert.equal(rates.estimateTapToPayFee(1), 20);
  assert.equal(rates.estimateTapToPayFee(250), 24, "3.5 cents round to four cents");
  assert.equal(rates.estimateTapToPayFee(10000), 160);
  assert.equal(rates.estimateExternalPayPalFee(10000), 375);
  assert.equal(rates.estimateTapToPayFee(0), 0);
  assert.equal(rates.estimateExternalPayPalFee(0), 0);
  for (const invalid of [-1, 0.5, NaN, Infinity]) assert.throws(() => rates.estimateTapToPayFee(invalid));
});

test("card-present contactless or a cardholder phone wallet alone never identifies Tap to Pay", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "card_present", card_present: { read_method: "contactless_emv", wallet: { type: "apple_pay" } } } }) });
  assert.deepEqual(await fees({ payment }), { feeCents: 175, complete: true, channel: "stripe_terminal" });
});

test("only a confirmed mobile reader identifies Tap to Pay, and its actual fee is not surcharged again", async () => {
  const payment = intent({ latest_charge: charge({ payment_method_details: { type: "card_present", card_present: { reader: "tmr_1" } }, balance_transaction: transaction({ fee: 345 }) }) });
  assert.deepEqual(await fees({ payment, reader: { device_type: "mobile_phone_reader" } }), { feeCents: 345, complete: true, channel: "stripe_tap_to_pay" });
  for (const setup of [{ reader: { device_type: "bbpos_wisepos_e" } }, { failReader: true }]) {
    assert.deepEqual(await fees({ payment, ...setup }), { feeCents: 345, complete: true, channel: "stripe_terminal" });
  }
});

test("pending online balances retain their known channel without assuming a standard or premium card rate", async () => {
  for (const details of [{ type: "card", card: { country: "IT", funding: "credit" } }, { type: "paypal" }]) {
    const result = await fees({ payment: intent({ latest_charge: charge({ payment_method_details: details, balance_transaction: null }) }) });
    assert.equal(result.channel, details.type === "card" ? "stripe_online" : "paypal");
    assert.equal(result.complete, false);
    assert.equal(result.estimatedFeeCents, undefined);
  }
});

test("zero balance fee without details can be delayed standalone billing and stays unverified", async () => {
  assert.deepEqual(await fees({ payment: intent({ latest_charge: charge({ balance_transaction: transaction({ fee: 0, fee_details: [] }) }) }) }), cardFee(0, false));
  assert.deepEqual(await fees({ payment: intent({ latest_charge: charge({ balance_transaction: transaction({ fee: 0, fee_details: [{ amount: 0, type: "stripe_fee" }] }) }) }) }), cardFee(0));
  const external = await fees({ payment: intent({ latest_charge: charge({ payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 0, fee_details: [] }) }) }) });
  assert.equal(external.complete, false);
  assert.equal(external.estimatedFeeCents, undefined, "a PayPal-only estimate cannot cover a missing Stripe standalone fee");
});

test("external PayPal estimates preserve the original processing fee after a verified partial or full refund", async () => {
  for (const refundedCents of [3000, 10000]) {
    const payment = intent({ latest_charge: charge({ amount_refunded: refundedCents, payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 100 }) }) });
    const result = await fees({ payment, refunds: { data: [refund({ amount: refundedCents, balance_transaction: transaction({ id: "txn_refund", amount: 0, fee: 0 }) })], has_more: false } }, [reference({ refundedCents })]);
    assert.equal(result.feeCents, 100);
    assert.equal(result.estimatedFeeCents, 375);
    assert.equal(result.complete, false);
  }
});

test("external PayPal refund disagreement or unavailable refund accounting clears estimate coverage", async () => {
  const payment = intent({ latest_charge: charge({ amount_refunded: 3000, payment_method_details: { type: "paypal" }, balance_transaction: transaction({ amount: 0, fee: 100 }) }) });
  for (const refunds of [
    { data: [], has_more: false },
    { data: [refund({ balance_transaction: null })], has_more: false },
    { data: [refund()], has_more: false },
    () => { throw new Error("Unavailable refund accounting"); },
  ]) {
    const result = await fees({ payment, refunds }, [reference({ refundedCents: 3000 })]);
    assert.deepEqual(result, { feeCents: 100, complete: false, channel: "paypal" });
  }
  const disagreement = await fees({ payment, refunds: { data: [], has_more: false } });
  assert.equal(disagreement.estimatedFeeCents, undefined);
  assert.equal(disagreement.estimateReason, undefined);
});
