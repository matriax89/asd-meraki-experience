import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const source = ts.transpileModule(readFileSync(new URL("../src/lib/refunds/data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, Error, Set, require: name => name === "server-only" ? {} : name === "@/lib/commerce/server" ? { commerceClient() { throw new Error("Do not open a production connection in this suite"); } } : name === "@/lib/i18n-utils" ? { getLocalizedText: title => typeof title === "string" ? title : title.it } : require(name) });
const { loadRefundPanel } = compiledModule.exports;
const eventId = "event-one";
const baseEvent = { id: eventId, titolo: { it: "Meraki Inverno", en: "Meraki Winter" }, data_inizio: "2026-12-19T12:00:00Z", canceled_at: null, cancellation_reason: null };
const order = (id = "order-one", overrides = {}) => ({ id, event_id: eventId, buyer_email: "buyer@example.test", amount_cents: 8500, state: "fulfilled", created_at: "2026-10-21T12:00:00Z", stripe_payment_intent: `pi_${id}`, stripe_session_id: `cs_${id}`, ...overrides });
const refund = (id, status = "succeeded", overrides = {}) => ({ id, event_id: eventId, order_id: "order-one", ticket_reservation_id: null, amount_cents: 1000, status, reason: "Rinuncia", created_at: "2026-10-21T13:00:00Z", failure_reason: null, email_sent_at: status === "succeeded" ? "2026-10-21T13:01:00Z" : null, ...overrides });

function fixture(changes = {}, failTable) {
  const tables = {
    events: [baseEvent], commerce_orders: [order()], ticket_reservations: [],
    commerce_passes: [{ id: "pass-one", event_id: eventId, order_id: "order-one", first_name: "Ada", last_name: "Rossi" }],
    commerce_entitlements: [{ id: "right-one", event_id: eventId, order_id: "order-one", pass_id: "pass-one", activity_name: "Workshop", status: "valid" }],
    tickets: [], meraki_refunds: [], meraki_event_cancellations: [], meraki_cancellation_emails: [], ...changes,
  };
  const calls = [];
  const db = { from(table) {
    const call = { table, filters: [], orders: [], fields: "", head: false }; calls.push(call);
    const query = {
      select(fields, options) { call.fields = fields; call.head = Boolean(options?.head); return this; },
      eq(key, value) { call.filters.push([key, value]); return this; },
      is(key, value) { call.filters.push([key, value]); return this; },
      order(key, options) { call.orders.push([key, options?.ascending !== false]); return this; },
      range(from, to) { call.range = [from, to]; return Promise.resolve(resolve(false)); },
      maybeSingle() { return Promise.resolve(resolve(true)); },
      then(done) { return Promise.resolve(resolve(false)).then(done); },
    };
    function resolve(single) {
      if (table === failTable) return { data: null, count: null, error: { message: "private-database-error" } };
      const rows = [...tables[table]].filter(row => call.filters.every(([key, value]) => (row[key] ?? null) === value));
      rows.sort((a, b) => { for (const [key, ascending] of call.orders) { const comparison = String(a[key] ?? "").localeCompare(String(b[key] ?? "")); if (comparison) return ascending ? comparison : -comparison; } return 0; });
      return { data: single ? rows[0] || null : call.head ? null : call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, count: rows.length, error: null };
    }
    return query;
  } };
  return { db, tables, calls, read: (selectedId = eventId, canManage = true) => loadRefundPanel(db, selectedId, canManage) };
}

test("refund balances subtract succeeded and all active holds, while failed/canceled requests release funds", async () => {
  const ctx = fixture({ meraki_refunds: [refund("success", "succeeded", { amount_cents: 2000 }), refund("pending", "pending"), refund("preparing", "preparing", { amount_cents: 500 }), refund("unknown", "unknown", { amount_cents: 250 }), refund("action", "requires_action", { amount_cents: 250 }), refund("failed", "failed", { amount_cents: 400 }), refund("canceled", "canceled", { amount_cents: 300 })] });
  const panel = await ctx.read(); const payment = panel.payments[0];
  assert.equal(payment.amountCents, 8500); assert.equal(payment.refundedCents, 2000);
  assert.equal(payment.pendingCents, 2000); assert.equal(payment.availableCents, 4500);
  assert.equal(payment.refunds.length, 7); assert.equal(panel.cancellation, null);
  assert.deepEqual(plain(payment.participants), [{ name: "Ada Rossi", entitlements: [{ id: "right-one", name: "Workshop", status: "valid" }] }]);
});

test("an event cancellation is complete only when money and both kinds of customer email are complete", async () => {
  const ctx = fixture({ events: [{ ...baseEvent, canceled_at: "2026-10-21T14:00:00Z", cancellation_reason: "Sede non disponibile" }], commerce_orders: [order("order-one", { state: "refunded" })], meraki_refunds: [refund("full", "succeeded", { amount_cents: 8500 })], meraki_event_cancellations: [{ id: "cancel-one", event_id: eventId, status: "processing" }], meraki_cancellation_emails: [{ id: "notice", cancellation_id: "cancel-one", email_sent_at: "2026-10-21T14:00:00Z" }] });
  let panel = await ctx.read();
  assert.deepEqual(plain(panel.cancellation), { id: "cancel-one", status: "completed", totalPayments: 1, completed: 1, pending: 0, failed: 0, remaining: 0, emailsRemaining: 0 });
  ctx.tables.meraki_refunds[0].email_sent_at = null;
  panel = await ctx.read();
  assert.equal(panel.cancellation.status, "processing"); assert.equal(panel.cancellation.completed, 1);
  assert.equal(panel.cancellation.emailsRemaining, 1, "the financial confirmation is still owed even after cancellation notices were sent");
  ctx.tables.meraki_refunds[0].email_sent_at = "2026-10-21T15:00:00Z";
  ctx.tables.meraki_cancellation_emails[0].email_sent_at = null;
  panel = await ctx.read();
  assert.equal(panel.cancellation.status, "processing"); assert.equal(panel.cancellation.emailsRemaining, 1);
});

test("pending email count combines cancellation notices and only succeeded refunds awaiting confirmation", async () => {
  const ctx = fixture({ meraki_event_cancellations: [{ id: "cancel-one", event_id: eventId, status: "processing" }], meraki_cancellation_emails: [1, 2].map(id => ({ id, cancellation_id: "cancel-one", email_sent_at: null })), meraki_refunds: [refund("success-unsent", "succeeded", { email_sent_at: null }), refund("success-sent"), refund("failed", "failed"), refund("pending", "pending")] });
  const panel = await ctx.read();
  assert.equal(panel.cancellation.emailsRemaining, 3);
  assert.equal(panel.cancellation.status, "processing");
  assert.equal(panel.cancellation.pending, 1);
});

test("a pending refund prevents cancellation completion even when no refund balance or email remains", async () => {
  const ctx = fixture({ commerce_orders: [order("order-one", { amount_cents: 1000 })], meraki_refunds: [refund("pending", "pending")], meraki_event_cancellations: [{ id: "cancel-one", event_id: eventId, status: "completed" }] });
  const panel = await ctx.read();
  assert.equal(panel.cancellation.remaining, 0); assert.equal(panel.cancellation.emailsRemaining, 0);
  assert.equal(panel.cancellation.pending, 1); assert.equal(panel.cancellation.completed, 0);
  assert.equal(panel.cancellation.status, "processing", "derive readiness from actual work rather than a stale summary status");
});

test("legacy reservation joins retain the matched customer, payment fallback and scoped refund history", async () => {
  const reservation = order("legacy-one", { stripe_payment_intent: null, amount_cents: 4500 });
  const ctx = fixture({ commerce_orders: [], ticket_reservations: [reservation], tickets: [{ id: "wrong-ticket", event_id: eventId, stripe_session_id: "cs_unrelated", buyer_nome: "Unrelated", buyer_cognome: "Person", status: "paid", stripe_payment_intent: "pi_wrong", qr_code: "PRIVATE-QR" }, { id: "legacy-ticket", event_id: eventId, stripe_session_id: reservation.stripe_session_id, buyer_nome: "Rita", buyer_cognome: "Bianchi", status: "used", stripe_payment_intent: "pi_legacy", qr_code: "PRIVATE-QR" }], meraki_refunds: [refund("legacy-refund", "succeeded", { order_id: null, ticket_reservation_id: "legacy-one", amount_cents: 500 }), refund("different-order", "succeeded", { order_id: "elsewhere", amount_cents: 900 })] });
  const panel = await ctx.read(eventId, false); const payment = panel.payments[0];
  assert.equal(panel.canManage, false); assert.equal(payment.kind, "legacy"); assert.equal(payment.id, "legacy-one");
  assert.equal(payment.refundedCents, 500); assert.equal(payment.availableCents, 4000);
  assert.deepEqual(plain(payment.participants), [{ name: "Rita Bianchi", entitlements: [{ id: "legacy-ticket", name: "Ingresso evento", status: "used" }] }]);
  assert.deepEqual(plain(payment.refunds.map(row => row.id)), ["legacy-refund"]);
  assert.equal(JSON.stringify(panel).includes("PRIVATE-QR"), false);
});

test("an upgrade payment retains the original pass owner's name but includes only its purchased admissions", async () => {
  const ctx = fixture({ commerce_orders: [order("upgrade-one")], commerce_entitlements: [{ id: "dinner", event_id: eventId, order_id: "upgrade-one", pass_id: "pass-one", activity_name: "Cena", status: "valid" }, { id: "workshop", event_id: eventId, order_id: "order-one", pass_id: "pass-one", activity_name: "Workshop", status: "valid" }] });
  const panel = await ctx.read();
  assert.deepEqual(plain(panel.payments[0].participants), [{ name: "Ada Rossi", entitlements: [{ id: "dinner", name: "Cena", status: "valid" }] }]);
});

test("unknown event filters never broaden the private payment query", async () => {
  const ctx = fixture(); const panel = await ctx.read("missing-event");
  assert.equal(panel.event, null); assert.equal(panel.payments.length, 0);
  assert.deepEqual(ctx.calls.map(call => call.table), ["events"]);
});

test("loader rejects an unavailable email queue instead of falsely completing cancellation", async () => {
  const ctx = fixture({ meraki_event_cancellations: [{ id: "cancel-one", event_id: eventId, status: "completed" }] }, "meraki_cancellation_emails");
  await assert.rejects(ctx.read(), /comunicazioni da inviare/);
});
