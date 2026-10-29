import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const ledgerOnly = value => JSON.parse(JSON.stringify(value, (key, entry) => key === 'registrationSummary' || key === 'dinnerSummary' ? undefined : entry));
class FixedDate extends Date { static now() { return Date.parse('2026-10-22T12:00:00Z'); } }
function compile(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), Date: FixedDate, Intl, Map, Set });
  return compiledModule.exports;
}
const affiliates = compile('lib/events/affiliates.ts');
const commissions = compile('lib/events/affiliate-commissions.ts');
const i18n = compile('lib/i18n-utils.ts');
const romeTime = compile('lib/commerce/rome-time.ts');
const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002';
const AFF = '20000000-0000-4000-8000-000000000001', OLD = '20000000-0000-4000-8000-000000000002';
const event = (id = A, overrides = {}) => ({ id, titolo: { it: 'Meraki Day', en: 'Meraki Day EN' }, data_inizio: '2026-12-19T11:30:00Z', data_fine: '2026-12-19T17:00:00Z', attivo: true, canceled_at: null, capacity: 5, affiliates: [{ id: AFF, name: 'Martina', active: true }], activities: [{ id: 'ws', name: 'Workshop', kind: 'workshop', capacity: 3 }, { id: 'mc', name: 'Masterclass', kind: 'masterclass', capacity: 2 }, { id: 'dinner', name: 'Cena', kind: 'dinner', capacity: 1 }], ...overrides });
const line = (totalCents, overrides = {}) => ({ kind: 'package', label: 'Workshop · Early Bird', quantity: 1, totalCents, packageId: 'ws', tierId: 'early', activityIds: ['ws'], ...overrides });
const order = (id, amount_cents, overrides = {}) => ({ id, event_id: A, state: 'fulfilled', amount_cents, created_at: '2026-10-21T10:00:00Z', stripe_payment_intent: `pi_${id}`, stripe_session_id: `cs_${id}`, refund_status: null, affiliate_id: null, affiliate_name: null, upgrade_pass_id: null, quote_lines: [line(amount_cents)], buyer_email: 'PRIVATE@example.test', participants: [{ firstName: 'PRIVATE-NAME' }], ...overrides });
const pass = (id, order_id, overrides = {}) => ({ id, order_id, event_id: A, status: 'paid', created_at: '2026-10-21T10:05:00Z', affiliate_id: null, affiliate_name: null, qr_code: 'PRIVATE-QR-CAPABILITY', first_name: 'PRIVATE-NAME', ...overrides });
const right = (id, pass_id, order_id, activity_id = 'ws', overrides = {}) => ({ id, pass_id, order_id, activity_id, activity_name: activity_id === 'mc' ? 'Masterclass' : activity_id === 'dinner' ? 'Cena' : 'Workshop', event_id: A, status: 'valid', checked_in_at: null, menu_choice: 'PRIVATE-MENU', ...overrides });
const ticket = (id, amount_cents, overrides = {}) => ({ id, event_id: A, status: 'paid', amount_cents, created_at: '2026-10-21T10:06:00Z', used_at: null, stripe_payment_intent: `pi_${id}`, stripe_session_id: `cs_${id}`, affiliate_id: null, affiliate_name: null, buyer_email: 'PRIVATE@example.test', qr_code: 'PRIVATE-QR-CAPABILITY', ...overrides });
const refund = (id, order_id, amount_cents, overrides = {}) => ({ id, event_id: A, order_id, ticket_reservation_id: null, payment_intent: `pi_${order_id}`, amount_cents, status: 'succeeded', stripe_refund_id: `re_${id}`, reason: 'PRIVATE-REASON', ...overrides });
const reportingOrder = (id = 'corrected', overrides = {}) => {
  const originalLines = [
    line(6118, { label: 'Combinata · Standard', packageId: 'combo', tierId: 'standard', participantIndex: 0, unitAmountCents: 6118, subtotalCents: 6500, discountCents: 382, activityIds: ['ws', 'mc'], activityAmounts: { ws: 3500, mc: 3000 } }),
    line(1882, { kind: 'addon', label: 'Cena', packageId: undefined, addonId: 'dinner', tierId: 'standard', participantIndex: 0, unitAmountCents: 1882, subtotalCents: 2000, discountCents: 118, activityIds: ['dinner'], activityAmounts: { dinner: 2000 } }),
  ];
  const discount = { id: '30000000-0000-4000-8000-000000000001', code: 'SCONTO5', discountType: 'fixed_amount', discountValue: 500, targetType: 'order', targetIds: [], eligibleCents: 8500 };
  const reporting = { subtotalCents: 8500, discountCents: 500, totalCents: 8000, discountExcludedActivityIds: ['dinner'], discount: { ...discount, targetType: 'package', targetIds: ['ws', 'mc', 'combo'], eligibleCents: 6500 }, lines: originalLines.map((entry, index) => ({ ...entry, totalCents: index ? 2000 : 6000, unitAmountCents: index ? 2000 : 6000, discountCents: index ? 0 : 500 })), reportingAdjustment: { version: 1, reason: 'dinner_full_price', originalDiscountTargetType: 'order', preservedTotalCents: 8000 }, participants: [{ firstName: 'PRIVATE', lastName: 'CUSTOMER' }], harmlessAdditionalField: { value: 'PRIVATE' } };
  return order(id, 8000, { affiliate_id: AFF, snapshot_activities: event().activities, quote_lines: originalLines, quote_discount: discount, reporting_quote: reporting, ...overrides });
};

function fixture(data = {}, { denied = false, fail, fees = {} } = {}) {
  const calls = []; const feeCalls = []; let authorized = false;
  const tables = { events: [event()], commerce_orders: [], ticket_reservations: [], commerce_passes: [], commerce_entitlements: [], tickets: [], meraki_refunds: [], commerce_payment_refunds: [], ticket_payment_refunds: [], commerce_waitlist: [], event_affiliate_commissions: [], leads: [], orders: [], marketing_contacts: [], ...data };
  const db = { from(table) {
    assert.ok(authorized, 'all private table reads follow staff authorization');
    const call = { table, fields: '', filters: [], orders: [] }; calls.push(call);
    const query = {
      select(fields, options) { call.fields = fields; call.options = options; return this; }, eq(key, value) { call.filters.push([key, value]); return this; },
      in(key, values) { call.filters.push([key, values]); return this; },
      order(key, options) { call.orders.push([key, options?.ascending !== false]); return this; },
      range(from, to) {
        call.range = [from, to];
        if (fail?.(call)) return Promise.resolve({ data: null, error: { code: 'TEST-FAILURE' } });
        const rows = tables[table].filter(row => call.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)).sort((a, b) => { for (const [key, ascending] of call.orders) { const result = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (result) return ascending ? result : -result; } return 0; });
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
      then(resolve, reject) {
        assert.deepEqual(plain(call.options), { count: 'exact', head: true }, 'operational statistics only retrieve an exact count');
        const count = tables[table].filter(row => call.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)).length;
        return Promise.resolve(fail?.(call) ? { data: null, count: null, error: { code: 'COUNT-FAILURE' } } : { data: null, count, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const api = compile('lib/admin/analytics.ts', { 'server-only': {}, '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => { if (denied) throw new Error('Accesso negato'); authorized = true; return db; } }, '@/lib/i18n-utils': i18n, '@/lib/commerce/rome-time': romeTime, '@/lib/events/affiliates': affiliates, '@/lib/events/affiliate-commissions': commissions, '@/lib/stripe/payment-fees': { loadPaymentFees: async refs => { assert.ok(authorized); feeCalls.push(plain(refs)); return new Map(refs.map(ref => [ref.id, fees[ref.id] || { feeCents: 0, complete: true }])); } } });
  return { load: input => api.loadAdminAnalytics({ locale: 'it', ...input }), calls, feeCalls };
}

test('authorization always runs before filters or private reads and malformed filters fail closed', async () => {
  const denied = fixture({}, { denied: true });
  await assert.rejects(denied.load({ eventId: 'invalid' }), /Accesso negato/); assert.equal(denied.calls.length, 0);
  for (const input of [{ eventId: 'invalid' }, { affiliateId: 'invalid' }, { period: 'unknown' }, { period: 'custom', from: '2026-02-30', to: '2026-03-01' }, { period: 'custom', from: '2026-10-22', to: '2026-10-21' }]) {
    const api = fixture(); await assert.rejects(api.load(input)); assert.equal(api.calls.length, 0);
  }
  const unknown = fixture(); await assert.rejects(unknown.load({ eventId: B }), /Evento non disponibile/); assert.deepEqual(unknown.calls.map(call => call.table), ['events']);
});

test('operational inbox and consent counts are exact, global, private and do not inherit sales filters', async () => {
  const api = fixture({
    leads: [{ id: 'new', status: 'nuovo', email: 'PRIVATE' }, { id: 'old', status: 'contattato' }],
    orders: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map((status, id) => ({ id, status, buyer_email: 'PRIVATE' })),
    marketing_contacts: [{ id: 'a', status: 'subscribed' }, { id: 'b', status: 'subscribed' }, { id: 'c', status: 'pending' }, { id: 'd', status: 'unsubscribed' }],
  });
  const result = await api.load({ eventId: A, affiliateId: AFF, period: 'custom', from: '2020-01-01', to: '2020-01-01' });
  assert.deepEqual(plain(result.operations), { newLeads: 1, openShopOrders: 3, confirmedContacts: 2 });
  for (const call of api.calls.filter(call => ['leads', 'orders', 'marketing_contacts'].includes(call.table))) {
    assert.equal(call.fields, 'id'); assert.deepEqual(plain(call.options), { count: 'exact', head: true });
    assert.deepEqual(call.filters.map(([key]) => key), ['status']); assert.equal(call.range, undefined);
  }
  const failed = fixture({}, { fail: call => call.table === 'marketing_contacts' });
  await assert.rejects(failed.load({}), /contatti confermati/, 'an unavailable count must not become a reassuring zero');
});

test('gross/refunds/net use captured payments once, real successful refund cents and exact upgrade deltas', async () => {
  const base = order('base', 8500, { affiliate_id: AFF, affiliate_name: 'Martina', quote_lines: [line(6500, { packageId: 'combo', label: 'WS + MC · Early Bird', activityIds: ['ws', 'mc'] }), line(2000, { kind: 'addon', label: 'Cena', packageId: undefined, tierId: undefined, activityIds: ['dinner'] })] });
  const upgrade = order('upgrade', 2000, { affiliate_id: AFF, affiliate_name: 'Martina', upgrade_pass_id: 'person-1', quote_lines: [line(0, { kind: 'upgrade', tierId: 'owned' }), line(2000, { kind: 'addon', label: 'Cena', packageId: undefined, tierId: undefined, activityIds: ['dinner'] })] });
  const legacy = { ...order('legacy', 4500, { affiliate_id: AFF, affiliate_name: 'Martina' }), quote_lines: undefined };
  const refundedLegacy = { ...order('legacy-refund', 2000, { state: 'refunded', affiliate_id: AFF, affiliate_name: 'Martina' }), quote_lines: undefined };
  const data = {
    events: [event(A, { capacity: 4 }), event(B, { capacity: null })],
    commerce_orders: [base, upgrade, order('partial', 5000), order('full', 3000, { state: 'refunded', affiliate_id: AFF, affiliate_name: 'Martina' }), order('refund-needed', 1000, { state: 'refund_required' }), order('pending', 9999, { state: 'awaiting_payment' }), order('expired', 2000, { state: 'expired' }), order('failed', 500, { state: 'payment_failed' }), order('free', 0)],
    ticket_reservations: [legacy, refundedLegacy],
    tickets: [ticket('legacy', 4500, { status: 'used', affiliate_id: AFF, affiliate_name: 'Martina' }), ticket('orphan', 3500), ticket('legacy-refund', 2000, { status: 'refunded', affiliate_id: AFF, affiliate_name: 'Martina' })],
    commerce_passes: [pass('person-1', 'base', { affiliate_id: AFF, affiliate_name: 'Martina' }), pass('person-2', 'partial'), pass('person-3', 'full', { status: 'refunded', affiliate_id: AFF, affiliate_name: 'Martina' }), pass('person-free', 'free')],
    commerce_entitlements: [right('r1', 'person-1', 'base', 'ws', { status: 'used' }), right('r2', 'person-1', 'base', 'mc'), right('r3', 'person-1', 'upgrade', 'dinner'), right('r4', 'person-2', 'partial'), right('r5', 'person-3', 'full', 'ws', { status: 'refunded' }), right('r6', 'person-free', 'free')],
    meraki_refunds: [refund('partial', 'partial', 1000), refund('partial-pending', 'partial', 900, { status: 'pending' }), refund('partial-failed', 'partial', 800, { status: 'failed' }), refund('full1', 'full', 1500), refund('full2', 'full', 1500), refund('full2', 'full', 1500), refund('legacyrefund', null, 2000, { ticket_reservation_id: 'legacy-refund', payment_intent: 'pi_legacy-refund' })],
    commerce_payment_refunds: [{ payment_intent: 'pi_full', status: 'succeeded' }], ticket_payment_refunds: [{ payment_intent: 'pi_legacy-refund' }],
    commerce_waitlist: [{ id: 'w1', event_id: A, status: 'waiting', created_at: base.created_at }, { id: 'w2', event_id: B, status: 'waiting', created_at: base.created_at }, { id: 'w3', event_id: A, status: 'notified', created_at: base.created_at }],
  };
  const api = fixture(data); const result = await api.load({ period: 'all' });
  assert.deepEqual(plain(result.metrics), { grossCents: 29500, refundedCents: 6000, netCents: 23500, feesCents: 0, netAfterFeesCents: 23500, missingFeePayments: 0, paidOrders: 6, validParticipants: 5, checkedInParticipants: 2, waiting: 2, pendingOrders: 1, expiredOrders: 1, failedOrders: 1 });
  assert.equal(result.registrationSummary.count, 5); assert.equal(result.dinnerSummary.count, 1);
  assert.equal(result.addons[0].count, 1); assert.equal(result.addons[0].netCents, 2000);
  assert.equal(result.packages.reduce((sum, item) => sum + item.netCents, 0), 18500);
  assert.equal(result.eventStats.find(row => row.id === A).remaining, 0);
  assert.equal(result.eventStats.find(row => row.id === B).remaining, null);
  assert.equal(result.activities.find(row => row.eventId === A && row.id === 'ws').validAdmissions, 3);
  assert.equal(result.activities.find(row => row.eventId === A && row.id === 'ws').remaining, 0);
  assert.equal(result.activities.find(row => row.eventId === A && row.id === 'mc').remaining, 1);
  const affiliated = result.affiliates.find(row => row.eventId === A && row.id === AFF);
  assert.equal(affiliated.grossCents, 20000); assert.equal(affiliated.refundedCents, 5000); assert.equal(affiliated.validParticipants, 2);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|pi_base|cs_base|re_full|buyer_email|payment_intent|qr_code|menu_choice/);
  for (const call of api.calls) { assert.notEqual(call.fields, '*'); assert.doesNotMatch(call.fields, /buyer_email|buyer_nome|first_name|last_name|participants|qr_code|reason|menu_choice/); }
});

test('partial refund success does not become a full refund merely because another pending refund exists', async () => {
  const api = fixture({ commerce_orders: [order('o', 6500, { state: 'refund_pending' })], meraki_refunds: [refund('succeeded', 'o', 1500), refund('pending', 'o', 5000, { status: 'pending' }), refund('failed', 'o', 5000, { status: 'failed' })], commerce_payment_refunds: [{ payment_intent: 'pi_o', status: 'pending' }] });
  const { metrics } = await api.load({});
  assert.equal(metrics.grossCents, 6500); assert.equal(metrics.refundedCents, 1500); assert.equal(metrics.netCents, 5000);
  assert.equal(metrics.paidOrders, 1);
});

test('paid order counts exclude full refunds while retaining partial refunds, upgrades and additions without counting people twice', async () => {
  const group = order('group', 7000, { affiliate_id: AFF, quote_lines: [line(3500, { participantIndex: 0 }), line(3500, { participantIndex: 1 })] });
  const upgrade = order('upgrade', 1000, { affiliate_id: AFF, upgrade_pass_id: 'group-0', quote_lines: [line(1000, { kind: 'upgrade', packageId: 'premium', tierId: 'standard' })] });
  const addon = order('dinner', 2000, { affiliate_id: AFF, upgrade_pass_id: 'group-1', quote_lines: [line(2000, { kind: 'addon', addonId: 'dinner', packageId: undefined, tierId: undefined, activityIds: ['dinner'] })] });
  const api = fixture({
    commerce_orders: [group, upgrade, addon, order('free', 0, { affiliate_id: AFF }), order('full-status', 3500, { affiliate_id: AFF, state: 'refunded' }), order('full-ledger', 3500, { affiliate_id: AFF })],
    commerce_passes: [pass('group-0', group.id, { affiliate_id: AFF, participant_index: 0 }), pass('group-1', group.id, { affiliate_id: AFF, participant_index: 1 }), pass('free-person', 'free', { affiliate_id: AFF }), pass('refunded-status', 'full-status', { affiliate_id: AFF, status: 'refunded' }), pass('refunded-ledger', 'full-ledger', { affiliate_id: AFF, status: 'refunded' })],
    commerce_entitlements: [right('ws-0', 'group-0', group.id), right('ws-1', 'group-1', group.id), right('dinner-1', 'group-1', addon.id, 'dinner'), right('free-ws', 'free-person', 'free')],
    meraki_refunds: [refund('partial', group.id, 1000), refund('full-ledger', 'full-ledger', 3500)],
  }, { fees: {
    'pi:pi_group': { feeCents: 200, complete: true }, 'pi:pi_upgrade': { feeCents: 50, complete: true }, 'pi:pi_dinner': { feeCents: 70, complete: true },
    'pi:pi_full-status': { feeCents: 100, complete: true }, 'pi:pi_full-ledger': { feeCents: 100, complete: true },
  } });
  const result = await api.load({ eventId: A, affiliateId: AFF });
  assert.equal(result.metrics.paidOrders, 3, 'a group order counts once; each later paid purchase counts once; full refunds and free orders do not count');
  assert.equal(result.metrics.validParticipants, 3, 'upgrades and additions do not issue another person; a valid free participant still counts');
  assert.equal(result.eventStats[0].paidOrders, 3); assert.equal(result.affiliates.find(row => row.id === AFF).paidOrders, 3);
  assert.equal(result.trend.reduce((sum, row) => sum + row.paidOrders, 0), 3);
  assert.deepEqual([result.metrics.grossCents, result.metrics.refundedCents, result.metrics.netCents, result.metrics.feesCents, result.metrics.netAfterFeesCents], [17000, 8000, 9000, 520, 8480], 'refunded payments and retained fees remain in the financial totals');
  assert.equal(api.feeCalls[0].length, 5, 'fees are still read for fully refunded payments');
});

test('an affiliate with only a free or fully refunded share does not gain a paid order from the rest of the group', async () => {
  for (const secondAmount of [0, 1]) {
    const purchase = order('mixed-group', 100, { affiliate_id: AFF, quote_lines: [line(100 - secondAmount, { participantIndex: 0 }), line(secondAmount, { participantIndex: 1 })] });
    const data = {
      commerce_orders: [purchase],
      commerce_passes: [pass('person-a', purchase.id, { affiliate_id: AFF, participant_index: 0 }), pass('person-b', purchase.id, { affiliate_id: OLD, participant_index: 1 })],
      commerce_entitlements: [right('ws-a', 'person-a', purchase.id), right('ws-b', 'person-b', purchase.id)],
      meraki_refunds: secondAmount ? [refund('almost-full', purchase.id, 99)] : [],
    };
    const all = await fixture(data).load({ eventId: A });
    assert.equal(all.metrics.paidOrders, 1); assert.equal(all.affiliates.find(row => row.id === AFF).paidOrders, 1);
    assert.equal(all.affiliates.find(row => row.id === OLD).paidOrders, 0);
    const filtered = await fixture(data).load({ eventId: A, affiliateId: OLD });
    assert.deepEqual([filtered.metrics.grossCents, filtered.metrics.refundedCents, filtered.metrics.netCents], [secondAmount, secondAmount, 0]);
    assert.equal(filtered.metrics.paidOrders, 0); assert.equal(filtered.eventStats[0].paidOrders, 0);
    assert.equal(filtered.trend.reduce((sum, row) => sum + row.paidOrders, 0), 0);
  }
});

test('reserved holds that passed their expiry are expired while asynchronous awaiting payments remain pending', async () => {
  const result = await fixture({ commerce_orders: [
    order('old-hold', 4500, { state: 'reserved', expires_at: '2026-10-22T11:59:59Z' }),
    order('live-hold', 4500, { state: 'reserved', expires_at: '2026-10-22T13:00:00Z' }),
    order('async-payment', 4500, { state: 'awaiting_payment', expires_at: '2026-10-22T11:59:59Z' }),
  ], ticket_reservations: [order('old-legacy-hold', 3500, { state: 'reserved', expires_at: '2026-10-21T10:00:00Z' })] }).load({});
  assert.equal(result.metrics.pendingOrders, 2); assert.equal(result.metrics.expiredOrders, 2); assert.equal(result.metrics.grossCents, 0);
  assert.equal(result.eventStats[0].pendingOrders, 2); assert.equal(result.eventStats[0].expiredOrders, 2);
});

test('whole-refund status and legacy external tombstones fill missing ledger data without double subtraction', async () => {
  const api = fixture({ commerce_orders: [order('full-status', 2000, { state: 'refunded' }), order('full-marker', 3000)], commerce_payment_refunds: [{ payment_intent: 'pi_full-marker', status: 'succeeded' }], tickets: [ticket('legacy', 4000, { status: 'refunded' })], meraki_refunds: [refund('some', 'full-marker', 1000)] });
  const { metrics } = await api.load({});
  assert.equal(metrics.grossCents, 9000); assert.equal(metrics.refundedCents, 9000); assert.equal(metrics.netCents, 0);
  assert.equal(metrics.paidOrders, 0);
});

test('a shared Stripe session joins historical rows with a missing intent before deduplicating revenue and refunds', async () => {
  const api = fixture({
    commerce_orders: [order('original', 6500, { stripe_payment_intent: null, stripe_session_id: 'cs_shared' })],
    ticket_reservations: [order('old-reservation', 6500, { stripe_payment_intent: 'pi_shared', stripe_session_id: 'cs_shared' })],
    tickets: [ticket('old-ticket', 6500, { stripe_payment_intent: 'pi_shared', stripe_session_id: 'cs_shared' })],
    commerce_passes: [pass('issued-original', 'original')],
    commerce_entitlements: [right('issued-original-ws', 'issued-original', 'original')],
    meraki_refunds: [refund('partial', 'original', 1500, { payment_intent: 'pi_shared' })],
  });
  const { metrics, packages, trend } = await api.load({});
  assert.equal(metrics.grossCents, 6500); assert.equal(metrics.refundedCents, 1500); assert.equal(metrics.netCents, 5000); assert.equal(metrics.paidOrders, 1);
  assert.equal(packages.reduce((sum, item) => sum + item.count, 0), 1); assert.equal(trend[0].grossCents, 6500);
  await assert.rejects(fixture({ commerce_orders: [order('a', 6500, { stripe_session_id: 'cs_shared' })], tickets: [ticket('b', 6500, { stripe_session_id: 'cs_shared' })] }).load({}), /Identità di pagamento incoerenti/);
});

test('Italian purchase days include the correct winter/summer midnight and preserve initial purchase cohorts through upgrades', async () => {
  for (const [date, before, start, end, after] of [
    ['2026-10-25', '2026-10-24T21:59:59Z', '2026-10-24T22:00:00Z', '2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z'],
    ['2027-03-28', '2027-03-27T22:59:59Z', '2027-03-27T23:00:00Z', '2027-03-28T21:59:59Z', '2027-03-28T22:00:00Z'],
  ]) {
    const api = fixture({ commerce_orders: [order('before', 100, { created_at: before }), order('start', 200, { created_at: start }), order('end', 300, { created_at: end }), order('after', 400, { created_at: after })], meraki_refunds: [refund('later', 'start', 50)], commerce_passes: [pass('p', 'start', { created_at: after })], commerce_entitlements: [right('r', 'p', 'start')] });
    const result = await api.load({ period: 'custom', from: date, to: date });
    assert.equal(result.metrics.grossCents, 500); assert.equal(result.metrics.refundedCents, 50); assert.equal(result.metrics.validParticipants, 1);
    assert.equal(result.trend.length, 1); assert.equal(result.trend[0].date, date); assert.equal(result.trend[0].grossCents, 500);
  }
  const initial = order('old', 4500, { created_at: '2026-10-01T10:00:00Z' }), upgrade = order('new', 2000, { created_at: '2026-10-21T10:00:00Z', upgrade_pass_id: 'p' });
  const api = fixture({ commerce_orders: [initial, upgrade], commerce_passes: [pass('p', 'old')], commerce_entitlements: [right('r', 'p', 'old'), right('r2', 'p', 'new', 'mc')] });
  const result = await api.load({ period: '7' });
  assert.equal(result.metrics.grossCents, 2000); assert.equal(result.metrics.validParticipants, 0, 'a new upgrade cannot create another participant in the new purchase cohort');
  assert.equal(result.eventStats[0].remaining, 4, 'capacity still uses the old valid participant');
  assert.equal(result.trend.length, 7); assert.equal(result.filters.from, '2026-10-16'); assert.equal(result.filters.to, '2026-10-22');
});

test('event and affiliate filters preserve independent payment attribution, no invented waiting list and global capacity', async () => {
  const api = fixture({ events: [event(), event(B)], commerce_orders: [order('a', 4500, { affiliate_id: AFF, affiliate_name: 'Martina' }), order('direct', 3500), order('other-event', 9999, { event_id: B })], commerce_passes: [pass('p1', 'a', { affiliate_id: AFF, affiliate_name: 'Martina' }), pass('p2', 'direct')], commerce_entitlements: [right('r1', 'p1', 'a'), right('r2', 'p2', 'direct')], commerce_waitlist: [{ id: 'w', event_id: A, status: 'waiting', created_at: '2026-10-21T10:00:00Z' }] });
  const result = await api.load({ eventId: A, affiliateId: AFF });
  assert.equal(result.metrics.grossCents, 4500); assert.equal(result.metrics.validParticipants, 1); assert.equal(result.metrics.waiting, null);
  assert.equal(result.eventStats.length, 1); assert.equal(result.eventStats[0].remaining, 3);
  assert.equal(result.activities.find(row => row.id === 'ws').remaining, 1);
  assert.equal(result.affiliates.length, 1); assert.equal(result.affiliates[0].id, AFF);
  assert.ok(result.notes.some(note => note.includes('non è attribuita agli affiliati')));
  for (const call of api.calls.filter(call => !['events', 'commerce_payment_refunds', 'ticket_payment_refunds', 'leads', 'orders', 'marketing_contacts'].includes(call.table))) assert.ok(call.filters.some(([key, value]) => key === 'event_id' && value === A));
  const direct = await fixture({ commerce_orders: [order('direct', 3500), order('aff', 4500, { affiliate_id: AFF })] }).load({ affiliateId: 'direct' });
  assert.equal(direct.metrics.grossCents, 3500);
  await assert.rejects(fixture().load({ affiliateId: OLD }), /Affiliato non disponibile/);
});

test('historical affiliates and zero-sales configurations remain available without silently merging events', async () => {
  const result = await fixture({ events: [event(), event(B, { affiliates: [{ id: OLD, name: 'Scuola B', active: false }] })], tickets: [ticket('historic', 1000, { affiliate_id: OLD, affiliate_name: 'Scuola storica' })] }).load({});
  assert.ok(result.affiliateOptions.some(row => row.id === OLD));
  assert.equal(result.affiliates.filter(row => row.id === OLD).length, 2);
  assert.equal(result.eventStats.find(row => row.id === B).grossCents, 0);
});

test('current event states, canceled admissions and capacity use authoritative records rather than revenue quantities', async () => {
  const events = [event(A, { canceled_at: '2026-10-21T10:00:00Z' }), event(B, { attivo: false }), event('10000000-0000-4000-8000-000000000003', { data_inizio: '2026-10-21T10:00:00Z', data_fine: '2026-10-23T10:00:00Z' }), event('10000000-0000-4000-8000-000000000004', { data_inizio: '2026-10-20T10:00:00Z', data_fine: null })];
  const result = await fixture({ events, commerce_orders: [order('paid', 4500)], commerce_passes: [pass('canceled-person', 'paid')], commerce_entitlements: [right('r', 'canceled-person', 'paid')] }).load({});
  assert.equal(result.metrics.grossCents, 4500); assert.equal(result.metrics.validParticipants, 0);
  assert.equal(result.eventStats.find(row => row.id === A).status, 'canceled'); assert.equal(result.eventStats.find(row => row.id === B).status, 'draft');
  assert.equal(result.eventStats.find(row => row.id.endsWith('3')).status, 'ongoing'); assert.equal(result.eventStats.find(row => row.id.endsWith('4')).status, 'past');
});

test('purchase-level discounts allocate only captured cents across product rows and zero/owned upgrades never inflate money', async () => {
  const result = await fixture({
    commerce_orders: [order('discounted', 6501, { quote_lines: [line(4500), line(3500, { packageId: 'mc', label: 'Masterclass · Early Bird', activityIds: ['mc'] })] }), order('dinner-only', 2000, { upgrade_pass_id: 'discount-ws', quote_lines: [line(0, { kind: 'upgrade', tierId: 'owned' }), line(2000, { kind: 'addon', label: 'Cena', activityIds: ['dinner'] })] }), order('free', 0)],
    commerce_passes: [pass('discount-ws', 'discounted', { participant_index: 0 }), pass('discount-mc', 'discounted', { participant_index: 1 }), pass('free-person', 'free')],
    commerce_entitlements: [right('discount-ws', 'discount-ws', 'discounted'), right('discount-mc', 'discount-mc', 'discounted', 'mc'), right('discount-dinner', 'discount-ws', 'dinner-only', 'dinner'), right('free-ws', 'free-person', 'free')],
  }).load({});
  assert.equal(result.metrics.grossCents, 8501); assert.equal(result.metrics.paidOrders, 2);
  assert.equal(result.packages.reduce((sum, item) => sum + item.netCents, 0), 6501); assert.equal(result.addons[0].netCents, 2000);
  assert.equal(result.packages.reduce((sum, item) => sum + item.count, 0), 3, 'two paid formula lines plus one free formula, without the owned upgrade');
});

test('all data sources paginate beyond 1000 rows with stable keys and query errors never return reassuring zero totals', async () => {
  const orders = Array.from({ length: 1001 }, (_, index) => order(`o${String(index).padStart(4, '0')}`, 100));
  const api = fixture({ commerce_orders: orders, meraki_refunds: Array.from({ length: 1001 }, (_, index) => refund(`refund${String(index).padStart(4, '0')}`, orders[index].id, 1)) });
  const result = await api.load({});
  assert.equal(result.metrics.grossCents, 100100); assert.equal(result.metrics.refundedCents, 1001);
  for (const table of ['commerce_orders', 'meraki_refunds']) assert.deepEqual(api.calls.filter(call => call.table === table).map(call => call.range), [[0, 499], [500, 999], [1000, 1499]]);
  for (const table of ['commerce_orders', 'meraki_refunds', 'commerce_entitlements', 'commerce_payment_refunds', 'ticket_payment_refunds', 'commerce_waitlist']) {
    await assert.rejects(fixture({}, { fail: call => call.table === table }).load({}), /Impossibile caricare/);
  }
  const later = fixture({ commerce_orders: orders }, { fail: call => call.table === 'commerce_orders' && call.range[0] === 500 });
  await assert.rejects(later.load({}), /Impossibile caricare/);
});

test('activity revenue uses frozen bundle allocations and reconciles refunds and actual fees to the cent', async () => {
  const purchase = order('bundle', 8500, {
    snapshot_activities: event().activities,
    quote_lines: [line(6500, { packageId: 'combo', activityIds: ['ws', 'mc'], activityAmounts: { ws: 4000, mc: 2500 } }), line(2000, { kind: 'addon', label: 'Cena', activityIds: ['dinner'], activityAmounts: { dinner: 2000 } })],
  });
  const api = fixture({
    events: [event(A, { activities: event().activities.map(activity => ({ ...activity, kind: 'extra' })) })],
    commerce_orders: [purchase], meraki_refunds: [refund('partial', 'bundle', 1700)],
  }, { fees: { 'pi:pi_bundle': { feeCents: 350, complete: true } } });
  const result = await api.load({});
  assert.deepEqual(plain(result.revenue.map(row => [row.id, row.grossCents])), [['masterclass', 2500], ['workshop', 4000], ['dinner', 2000]]);
  assert.equal(result.revenue.find(row => row.id === 'workshop').refundedCents, 800);
  assert.equal(result.revenue.find(row => row.id === 'workshop').feesCents, 164);
  for (const field of ['grossCents', 'refundedCents', 'netCents', 'feesCents', 'netAfterFeesCents']) assert.equal(result.revenue.reduce((sum, row) => sum + row[field], 0), result.metrics[field], field);
  assert.equal(result.metrics.netCents, 6800); assert.equal(result.metrics.netAfterFeesCents, 6450);
  assert.equal(result.affiliates.find(row => row.id === 'direct').netAfterFeesCents, 6450);
  assert.equal(result.eventStats[0].feesCents, 350); assert.equal(result.trend[0].netAfterFeesCents, 6450);
  assert.deepEqual(api.feeCalls[0], [{ id: 'pi:pi_bundle', paymentIntent: 'pi_bundle', sessionId: 'cs_bundle', amountCents: 8500, refundedCents: 1700 }]);
});

test('an activity-target discount reduces only its own share of a mixed package', async () => {
  const result = await fixture({ commerce_orders: [order('targeted', 10000, {
    quote_discount: { targetType: 'activity', targetIds: ['mc'] },
    quote_lines: [line(8000, { activityIds: ['ws', 'mc'], activityAmounts: { ws: 6000, mc: 4000 }, subtotalCents: 10000, discountCents: 2000 }), line(2000, { kind: 'addon', activityIds: ['dinner'], activityAmounts: { dinner: 2000 }, discountCents: 0 })],
  })], meraki_refunds: [refund('partial', 'targeted', 1000)] }, { fees: { 'pi:pi_targeted': { feeCents: 300, complete: true } } }).load({});
  assert.equal(result.revenue.find(row => row.id === 'workshop').grossCents, 6000);
  assert.equal(result.revenue.find(row => row.id === 'masterclass').grossCents, 2000);
  assert.equal(result.revenue.find(row => row.id === 'dinner').grossCents, 2000);
  assert.equal(result.revenue.find(row => row.id === 'workshop').netAfterFeesCents, 5220);
  assert.equal(result.metrics.netAfterFeesCents, 8700);
});

test('an explicit reporting correction keeps dinner full price across activity and product allocations without changing paid financials', async () => {
  const purchase = reportingOrder();
  const original = plain(purchase);
  const data = { commerce_orders: [purchase], commerce_passes: [pass('corrected-person', purchase.id, { package_id: 'combo', package_name: 'Combinata', package_activity_ids: ['ws', 'mc'], affiliate_id: AFF })], commerce_entitlements: [right('corrected-ws', 'corrected-person', purchase.id), right('corrected-mc', 'corrected-person', purchase.id, 'mc'), right('corrected-dinner', 'corrected-person', purchase.id, 'dinner')], meraki_refunds: [refund('partial', purchase.id, 1200)] };
  const fees = { [`pi:pi_${purchase.id}`]: { feeCents: 300, complete: true } };
  const api = fixture(data, { fees });
  const corrected = await api.load({});
  const raw = await fixture({ ...data, commerce_orders: [{ ...purchase, reporting_quote: null }] }, { fees }).load({});
  assert.deepEqual(plain(corrected.revenue.map(row => [row.id, row.grossCents])), [['masterclass', 2769], ['workshop', 3231], ['dinner', 2000]]);
  assert.deepEqual(plain(raw.revenue.map(row => [row.id, row.grossCents])), [['masterclass', 2823], ['workshop', 3295], ['dinner', 1882]]);
  assert.equal(corrected.packages[0].netCents, 5100); assert.equal(corrected.tiers[0].netCents, 5100); assert.equal(corrected.addons[0].netCents, 1700);
  assert.equal(corrected.packages[0].count, raw.packages[0].count); assert.equal(corrected.addons[0].count, raw.addons[0].count);
  for (const key of ['metrics', 'trend', 'eventStats', 'affiliates', 'activities', 'attendanceGroups', 'operations']) assert.deepEqual(ledgerOnly(corrected[key]), ledgerOnly(raw[key]), key);
  assert.equal(corrected.registrationSummary.grossCents, 6000); assert.equal(corrected.dinnerSummary.grossCents, 2000);
  assert.equal(corrected.registrationSummary.count, raw.registrationSummary.count); assert.equal(corrected.dinnerSummary.count, raw.dinnerSummary.count);
  for (const key of ['grossCents', 'refundedCents', 'netCents', 'feesCents', 'netAfterFeesCents']) assert.equal(corrected.revenue.reduce((total, row) => total + row[key], 0), corrected.metrics[key], key);
  const dinner = corrected.revenue.find(row => row.id === 'dinner');
  assert.equal(dinner.refundedCents, 300); assert.equal(dinner.feesCents, 75); assert.equal(dinner.netAfterFeesCents, 1625);
  assert.deepEqual(plain(purchase), original, 'read-only reporting must preserve original quote, charge and correction');
  assert.deepEqual(api.feeCalls[0], [{ id: `pi:pi_${purchase.id}`, paymentIntent: `pi_${purchase.id}`, sessionId: `cs_${purchase.id}`, amountCents: 8000, refundedCents: 1200 }]);
  assert.ok(api.calls.find(call => call.table === 'commerce_orders').fields.includes('reporting_quote'));
  assert.match(corrected.notes.join(' '), /ripartizione contabile rettificata/);
  assert.doesNotMatch(JSON.stringify(corrected), /PRIVATE|reportingAdjustment|preservedTotalCents|dinner_full_price|reporting_quote/);
  const csv = compile('lib/admin/analytics-csv.ts').adminAnalyticsCsv(corrected);
  assert.ok(csv.includes('"Cena";"20";"3";"17";"0,75";"16,25";"Complete"'));
  assert.ok(csv.includes('"Lordo (€)";"60"')); assert.ok(csv.includes('"Rimborsi riusciti (€)";"9"'));
  assert.ok(csv.includes('"Lordo cena (€)";"20"')); assert.ok(csv.includes('"Rimborsi cena (€)";"3"'));
  assert.ok(csv.includes('"Totale attività e cena";"80";"12";"68";"3";"65";"Complete"'));
  assert.doesNotMatch(csv, /PRIVATE|reportingAdjustment|preservedTotalCents|dinner_full_price/);
});

test('three reviewed reporting corrections change only their allocation and leave every unrelated purchase intact', async () => {
  const reviewed = ['reviewed-1', 'reviewed-2', 'reviewed-3'].map(id => reportingOrder(id));
  const unaffected = order('unaffected', 10000, { quote_lines: [line(4500), line(3500, { packageId: 'mc', activityIds: ['mc'] }), line(2000, { kind: 'addon', label: 'Cena', addonId: 'dinner', packageId: undefined, activityIds: ['dinner'] })] });
  const issued = { commerce_passes: [pass('unaffected-ws', unaffected.id, { participant_index: 0 }), pass('unaffected-mc', unaffected.id, { participant_index: 1 })], commerce_entitlements: [right('unaffected-ws', 'unaffected-ws', unaffected.id), right('unaffected-mc', 'unaffected-mc', unaffected.id, 'mc'), right('unaffected-dinner', 'unaffected-mc', unaffected.id, 'dinner')] };
  const before = await fixture({ ...issued, commerce_orders: [...reviewed.map(entry => ({ ...entry, reporting_quote: null })), unaffected] }).load({});
  const after = await fixture({ ...issued, commerce_orders: [...reviewed, unaffected] }).load({});
  const gross = (result, id) => result.revenue.find(row => row.id === id).grossCents;
  assert.equal(gross(after, 'workshop') - gross(before, 'workshop'), -192);
  assert.equal(gross(after, 'masterclass') - gross(before, 'masterclass'), -162);
  assert.equal(gross(after, 'dinner') - gross(before, 'dinner'), 354);
  assert.deepEqual(plain(after.metrics), plain(before.metrics)); assert.equal(after.metrics.grossCents, 34000);
  assert.deepEqual(plain(after.packages.find(entry => entry.id === `${A}:ws`)), plain(before.packages.find(entry => entry.id === `${A}:ws`)));
  const withoutCorrection = await fixture({ commerce_orders: [unaffected] }).load({});
  const withNull = await fixture({ commerce_orders: [{ ...unaffected, reporting_quote: null }] }).load({});
  assert.deepEqual(plain(withoutCorrection), plain(withNull));
});

test('a present but invalid reporting correction fails closed rather than silently using the original paid allocation', async () => {
  const purchase = reportingOrder();
  const changes = [
    () => ({}), () => false, () => [],
    quote => { delete quote.reportingAdjustment; },
    quote => { quote.reportingAdjustment.version = 2; },
    quote => { quote.reportingAdjustment.reason = 'unknown'; },
    quote => { quote.reportingAdjustment.preservedTotalCents = 8500; },
    quote => { quote.totalCents = 8500; },
    quote => { quote.discount.targetType = 'order'; },
    quote => { quote.discount.discountValue = 600; },
    quote => { quote.lines[0].discountCents = 499; },
    quote => { quote.lines[0].activityAmounts.ws += 1; },
    quote => { quote.lines[1].label = 'Other product'; },
    quote => { quote.lines[1].quantity = 2; },
    quote => { quote.lines[1].totalCents = 1900; },
    quote => { quote.discountExcludedActivityIds = ['ws']; },
    quote => { delete quote.discountExcludedActivityIds; },
  ];
  for (const change of changes) {
    const reporting = plain(purchase.reporting_quote);
    const result = change(reporting);
    await assert.rejects(fixture({ commerce_orders: [{ ...purchase, reporting_quote: result === undefined ? reporting : result }] }).load({}), /Ripartizione contabile non verificabile/);
  }
  const changedOriginal = plain(purchase);
  changedOriginal.quote_lines[0].discountCents += 1; changedOriginal.quote_lines[0].totalCents -= 1; changedOriginal.quote_lines[0].unitAmountCents -= 1;
  changedOriginal.quote_lines[1].discountCents -= 1; changedOriginal.quote_lines[1].totalCents += 1; changedOriginal.quote_lines[1].unitAmountCents += 1;
  await assert.rejects(fixture({ commerce_orders: [changedOriginal] }).load({}), /Ripartizione contabile non verificabile/);
});

test('future mixed bundles honor dinner exclusions from the paid quote without any reporting correction', async () => {
  const data = { commerce_orders: [order('new-mixed', 7500, { quote_discount: { targetType: 'package', targetIds: ['mixed'] }, quote_discount_exclusions: ['dinner'], quote_lines: [line(7500, { packageId: 'mixed', activityIds: ['ws', 'dinner'], activityAmounts: { ws: 6000, dinner: 2000 }, subtotalCents: 8000, discountCents: 500 })] })] };
  const api = fixture(data);
  const result = await api.load({});
  assert.equal(result.revenue.find(row => row.id === 'workshop').grossCents, 5500);
  assert.equal(result.revenue.find(row => row.id === 'dinner').grossCents, 2000);
  assert.equal(result.metrics.grossCents, 7500);
  assert.ok(api.calls.find(call => call.table === 'commerce_orders').fields.includes('quote_discount_exclusions:quote->discountExcludedActivityIds'));
  assert.doesNotMatch(result.notes.join(' '), /ripartizione contabile rettificata/);
});

test('missing fees make only affected net amounts unavailable and retained fees can make a full refund negative', async () => {
  const result = await fixture({ commerce_orders: [
    order('unknown', 1000),
    order('dinner', 500, { quote_lines: [line(500, { kind: 'addon', activityIds: ['dinner'] })] }),
    order('refunded', 1000, { state: 'refunded', quote_lines: [line(1000, { activityIds: ['mc'] })] }),
  ] }, { fees: {
    'pi:pi_unknown': { feeCents: 50, complete: false },
    'pi:pi_dinner': { feeCents: 30, complete: true },
    'pi:pi_refunded': { feeCents: 60, complete: true },
  } }).load({});
  assert.equal(result.metrics.feesCents, 140); assert.equal(result.metrics.missingFeePayments, 1); assert.equal(result.metrics.netAfterFeesCents, null);
  assert.equal(result.revenue.find(row => row.id === 'workshop').netAfterFeesCents, null);
  assert.equal(result.revenue.find(row => row.id === 'dinner').netAfterFeesCents, 470);
  assert.equal(result.revenue.find(row => row.id === 'masterclass').netAfterFeesCents, -60);
  assert.equal(result.trend[0].netAfterFeesCents, null); assert.equal(result.eventStats[0].netAfterFeesCents, null);
  assert.ok(result.notes.some(note => note.includes('non sono ancora disponibili')));
});

test('fee reads include only filtered captured deduplicated payments and historical revenue stays reconcilable', async () => {
  const historical = order('legacy', 900, { affiliate_id: AFF });
  const api = fixture({
    events: [event(), event(B)],
    commerce_orders: [
      order('combo', 6501, { affiliate_id: AFF, quote_lines: [line(6501, { activityIds: ['ws', 'mc'] })] }),
      order('pending', 999, { affiliate_id: AFF, state: 'awaiting_payment' }), order('free', 0, { affiliate_id: AFF }),
      order('direct', 1000), order('old', 1000, { affiliate_id: AFF, created_at: '2025-01-01T00:00:00Z' }), order('other', 1000, { affiliate_id: AFF, event_id: B }),
    ], ticket_reservations: [historical], tickets: [ticket('legacy', 900, { affiliate_id: AFF })],
  });
  const result = await api.load({ eventId: A, affiliateId: AFF, period: '7' });
  assert.deepEqual(api.feeCalls[0].map(ref => ref.id).sort(), ['pi:pi_combo', 'pi:pi_legacy']);
  assert.equal(result.metrics.grossCents, 7401);
  assert.equal(result.revenue.find(row => row.id === 'workshop').grossCents, 3251);
  assert.equal(result.revenue.find(row => row.id === 'masterclass').grossCents, 3250);
  assert.equal(result.revenue.find(row => row.id === 'unallocated').grossCents, 900);
  assert.equal(result.revenue.reduce((sum, row) => sum + row.grossCents, 0), result.metrics.grossCents);
  assert.ok(result.notes.some(note => note.includes('parti uguali')));
  assert.ok(result.notes.some(note => note.includes('Non attribuito')));
  const empty = await fixture().load({});
  assert.deepEqual(plain(empty.revenue.map(row => [row.id, row.netAfterFeesCents])), [['masterclass', 0], ['workshop', 0], ['dinner', 0]]);
});

test('capacity groups count people once across sessions and current capacity ignores sales filters', async () => {
  const shared = {
    events: [event(A, { capacity: null, activities: event().activities.map(activity => ({ ...activity, capacity: 100 })) })],
    commerce_orders: [order('both', 6500, { affiliate_id: AFF }), order('ws-only', 3500, { affiliate_id: AFF }), order('mc-only', 4000),
      order('held', 5000, { state: 'reserved', expires_at: '2026-10-22T13:00:00Z', demand: { _passes: 2, ws: 1, mc: 1 } }),
      order('expired-hold', 5000, { state: 'reserved', expires_at: '2026-10-22T11:00:00Z', demand: { _passes: 20, ws: 20 } }),
      order('async-hold', 5000, { state: 'awaiting_payment', expires_at: '2026-10-22T11:00:00Z', demand: { _passes: 1, ws: 1 } })],
    commerce_passes: [pass('both', 'both', { affiliate_id: AFF }), pass('ws-only', 'ws-only', { affiliate_id: AFF }), pass('mc-only', 'mc-only')],
    commerce_entitlements: [right('both-ws', 'both', 'both'), right('both-mc', 'both', 'both', 'mc'), right('only-ws', 'ws-only', 'ws-only'), right('only-mc', 'mc-only', 'mc-only', 'mc')],
  };
  const result = await fixture(shared).load({ affiliateId: AFF });
  assert.equal(result.metrics.validParticipants, 2);
  assert.deepEqual(plain(result.attendanceGroups), [{ eventId: A, eventTitle: 'Meraki Day', currentParticipants: 3, workshopOnly: 1, masterclassOnly: 1, both: 1, otherParticipants: 0, capacity: null, remaining: null, reservedParticipants: 3 }]);
  const workshop = result.activities.find(row => row.id === 'ws');
  assert.equal(workshop.validAdmissions, 2); assert.equal(workshop.occupied, 2);
  assert.equal(workshop.remaining, 98); assert.equal(workshop.reservedAdmissions, 2); assert.equal(workshop.availableForSale, 96);
  const masterclass = result.activities.find(row => row.id === 'mc');
  assert.equal(masterclass.validAdmissions, 1); assert.equal(masterclass.occupied, 2);
  assert.equal(masterclass.remaining, 98); assert.equal(masterclass.reservedAdmissions, 1); assert.equal(masterclass.availableForSale, 97);
  const limited = await fixture({ ...shared, events: [event(A, { ...shared.events[0], capacity: 7 })] }).load({});
  assert.equal(limited.attendanceGroups[0].remaining, 4);
  assert.equal(limited.activities.find(row => row.id === 'ws').availableForSale, 1, 'the extra global limit includes all active holds');
});

test('affiliate compensation follows valid people, never order count or number of activities', async () => {
  const data = {
    event_affiliate_commissions: [{ event_id: A, affiliate_id: AFF, commission_cents: 500 }, { event_id: B, affiliate_id: AFF, commission_cents: 700 }],
    commerce_orders: [order('initial', 20000, { affiliate_id: AFF }), order('addon-upgrade', 2500, { affiliate_id: AFF, upgrade_pass_id: 'p0' }), order('refunded', 3000, { state: 'refunded', affiliate_id: AFF }), order('pending', 3000, { state: 'awaiting_payment', affiliate_id: AFF }), order('direct', 3000)],
    commerce_passes: [...Array.from({ length: 8 }, (_, index) => pass(`p${index}`, 'initial', { affiliate_id: AFF })), pass('refunded-person', 'refunded', { status: 'refunded', affiliate_id: AFF }), pass('direct-person', 'direct')],
    commerce_entitlements: [...Array.from({ length: 8 }, (_, index) => [right(`ws${index}`, `p${index}`, 'initial'), right(`mc${index}`, `p${index}`, 'initial', 'mc')]).flat(), right('dinner-addon', 'p0', 'addon-upgrade', 'dinner'), right('revoked', 'refunded-person', 'refunded', 'ws', { status: 'refunded' }), right('direct-ws', 'direct-person', 'direct')],
  };
  const result = await fixture(data).load({ eventId: A });
  const affiliate = result.affiliates.find(row => row.id === AFF);
  assert.equal(affiliate.validParticipants, 8); assert.equal(affiliate.commissionPerParticipantCents, 500); assert.equal(affiliate.commissionCents, 4000);
  assert.notEqual(affiliate.commissionCents, affiliate.paidOrders * 500);
  assert.equal(result.affiliates.find(row => row.id === 'direct').commissionCents, 0);
  assert.equal(result.affiliates.find(row => row.id === 'direct').commissionPerParticipantCents, 0);
  const noRate = await fixture({ commerce_orders: data.commerce_orders, commerce_passes: data.commerce_passes, commerce_entitlements: data.commerce_entitlements }).load({ eventId: A });
  assert.equal(noRate.affiliates.find(row => row.id === AFF).commissionCents, 0);
  await assert.rejects(fixture(data, { fail: call => call.table === 'event_affiliate_commissions' }).load({}), /compensi degli affiliati/);
  await assert.rejects(fixture({ event_affiliate_commissions: [{ event_id: A, affiliate_id: AFF, commission_cents: -1 }] }).load({}), /Compenso affiliato non valido/);
});

test('analytics keeps credit compensation separate from EUR without altering collected revenue or processor net', async () => {
  const data = {
    events: [event(), event(B)],
    event_affiliate_commissions: [
      { event_id: A, affiliate_id: AFF, commission_type: 'credits', commission_cents: 0, commission_credits: 3 },
      { event_id: B, affiliate_id: AFF, commission_cents: 700 },
      { event_id: A, affiliate_id: 'direct', commission_type: 'credits', commission_cents: 0, commission_credits: 99 },
    ],
    commerce_orders: [order('base', 20000, { affiliate_id: AFF }), order('upgrade', 2500, { affiliate_id: AFF, upgrade_pass_id: 'p1' })],
    commerce_passes: [pass('p1', 'base', { affiliate_id: AFF }), pass('p2', 'base', { affiliate_id: AFF })],
    commerce_entitlements: [right('ws1', 'p1', 'base'), right('mc1', 'p1', 'base', 'mc'), right('ws2', 'p2', 'base'), right('upgrade1', 'p1', 'upgrade', 'dinner')],
    tickets: [ticket('legacy-a', 1000, { affiliate_id: AFF }), ticket('legacy-b', 1000, { event_id: B, affiliate_id: AFF }), ticket('direct', 1000)],
  };
  const result = await fixture(data).load({});
  const credit = result.affiliates.find(row => row.eventId === A && row.id === AFF);
  assert.equal(credit.validParticipants, 3); assert.equal(credit.commissionType, 'credits');
  assert.equal(credit.commissionPerParticipantCredits, 3); assert.equal(credit.commissionCredits, 9);
  assert.equal(credit.commissionPerParticipantCents, 0); assert.equal(credit.commissionCents, 0);
  const euro = result.affiliates.find(row => row.eventId === B && row.id === AFF);
  assert.equal(euro.commissionType, 'eur'); assert.equal(euro.commissionCents, 700); assert.equal(euro.commissionCredits, 0);
  const direct = result.affiliates.find(row => row.id === 'direct');
  assert.equal(direct.commissionCents, 0); assert.equal(direct.commissionCredits, 0);
  const withoutRates = await fixture({ ...data, event_affiliate_commissions: [] }).load({});
  assert.deepEqual(plain(result.metrics), plain(withoutRates.metrics));
  assert.deepEqual(plain(result.revenue), plain(withoutRates.revenue));
  assert.match(result.notes.join(' '), /Euro e crediti.*separatamente, senza conversioni/);
});

test('analytics rejects corrupt credit amounts or units without presenting an invented zero', async () => {
  for (const rate of [
    { commission_type: 'credits', commission_cents: 0, commission_credits: 1.5 },
    { commission_type: 'credits', commission_cents: 0, commission_credits: -1 },
    { commission_type: 'credits', commission_cents: 500, commission_credits: 3 },
    { commission_type: 'eur', commission_cents: 500, commission_credits: 3 },
    { commission_type: 'unknown', commission_cents: 0, commission_credits: 0 },
  ]) await assert.rejects(fixture({ event_affiliate_commissions: [{ event_id: A, affiliate_id: AFF, ...rate }] }).load({}), /Compenso affiliato non valido/);
});

test('current per-person affiliation splits a shared payment, refunds and fees without attributing the whole group twice', async () => {
  const purchase = order('group', 12000, { affiliate_id: AFF, affiliate_name: 'Original group affiliate', quote_lines: [
    line(6000, { participantIndex: 0, packageId: 'combo', label: 'Combinata', activityIds: ['ws', 'mc'], activityAmounts: { ws: 3500, mc: 2500 } }),
    line(2000, { participantIndex: 0, kind: 'addon', label: 'Cena', addonId: 'dinner', packageId: undefined, activityIds: ['dinner'], activityAmounts: { dinner: 2000 } }),
    line(4000, { participantIndex: 1, packageId: 'ws', activityIds: ['ws'], activityAmounts: { ws: 4000 } }),
  ] });
  const people = [pass('person-a', purchase.id, { participant_index: 0, affiliate_id: AFF, affiliate_name: 'Martina' }), pass('person-b', purchase.id, { participant_index: 1, affiliate_id: OLD, affiliate_name: 'Seconda scuola' })];
  const data = { commerce_orders: [purchase], commerce_passes: people, commerce_entitlements: [right('a-ws', 'person-a', purchase.id), right('a-mc', 'person-a', purchase.id, 'mc'), right('a-dinner', 'person-a', purchase.id, 'dinner'), right('b-ws', 'person-b', purchase.id)], meraki_refunds: [refund('partial', purchase.id, 1001)], event_affiliate_commissions: [{ event_id: A, affiliate_id: AFF, commission_cents: 500 }, { event_id: A, affiliate_id: OLD, commission_type: 'credits', commission_cents: 0, commission_credits: 2 }] };
  const fees = { 'pi:pi_group': { feeCents: 301, complete: true } };
  const before = await fixture({ ...data, commerce_passes: people.map(person => ({ ...person, affiliate_id: AFF, affiliate_name: 'Martina' })) }, { fees }).load({});
  const currentApi = fixture(data, { fees });
  const current = await currentApi.load({});
  for (const key of ['metrics', 'trend', 'packages', 'tiers', 'addons', 'eventStats', 'attendanceGroups']) assert.deepEqual(ledgerOnly(current[key]), ledgerOnly(before[key]), key);
  assert.equal(current.metrics.paidOrders, 1); assert.equal(current.metrics.validParticipants, 2);
  const a = current.affiliates.find(row => row.id === AFF); const b = current.affiliates.find(row => row.id === OLD);
  assert.deepEqual([a.grossCents, a.refundedCents, a.feesCents, a.netAfterFeesCents, a.validParticipants, a.paidOrders], [8000, 667, 200, 7133, 1, 1]);
  assert.deepEqual([b.grossCents, b.refundedCents, b.feesCents, b.netAfterFeesCents, b.validParticipants, b.paidOrders], [4000, 334, 101, 3565, 1, 1]);
  assert.equal(a.commissionCents, 500); assert.equal(b.commissionCredits, 2);
  for (const key of ['grossCents', 'refundedCents', 'feesCents', 'netCents', 'netAfterFeesCents']) assert.equal(a[key] + b[key], current.metrics[key], key);
  assert.ok(current.notes.includes('Un acquisto di gruppo può comparire tra gli ordini di più affiliati; il totale generale conta ogni ordine una sola volta.'));
  const filteredA = await fixture(data, { fees }).load({ affiliateId: AFF });
  const filteredBApi = fixture(data, { fees }); const filteredB = await filteredBApi.load({ affiliateId: OLD });
  assert.deepEqual([filteredA.metrics.grossCents, filteredA.metrics.refundedCents, filteredA.metrics.feesCents], [8000, 667, 200]);
  assert.deepEqual([filteredB.metrics.grossCents, filteredB.metrics.refundedCents, filteredB.metrics.feesCents], [4000, 334, 101]);
  assert.equal(filteredA.metrics.paidOrders, 1); assert.equal(filteredB.metrics.paidOrders, 1);
  assert.equal(filteredB.addons.length, 0); assert.equal(filteredB.packages.reduce((total, entry) => total + entry.netCents, 0), 3666);
  for (const result of [filteredA, filteredB]) for (const key of ['grossCents', 'refundedCents', 'feesCents', 'netAfterFeesCents']) assert.equal(result.revenue.reduce((total, row) => total + row[key], 0), result.metrics[key], key);
  for (const row of current.revenue) for (const key of ['grossCents', 'refundedCents', 'netCents', 'feesCents', 'netAfterFeesCents']) assert.equal(filteredA.revenue.find(entry => entry.id === row.id)[key] + filteredB.revenue.find(entry => entry.id === row.id)[key], row[key], `${row.id}.${key}`);
  assert.deepEqual(filteredBApi.feeCalls[0], [{ id: 'pi:pi_group', paymentIntent: 'pi_group', sessionId: 'cs_group', amountCents: 12000, refundedCents: 1001 }]);
  assert.equal(currentApi.feeCalls[0].length, 1);
  assert.ok(currentApi.calls.find(call => call.table === 'commerce_passes').fields.includes('participant_index'));
  assert.doesNotMatch(JSON.stringify(current), /PRIVATE|participant_index|participantIndex|buyer_email|qr_code/);
  assert.equal(purchase.affiliate_id, AFF); assert.equal(purchase.amount_cents, 12000);
});

test('an upgrade follows its current pass affiliation while the original group keeps its separate people and purchase cohorts', async () => {
  const original = order('initial-group', 10000, { affiliate_id: AFF, created_at: '2026-09-01T10:00:00Z', quote_lines: [line(6000, { participantIndex: 0 }), line(4000, { participantIndex: 1 })] });
  const upgrade = order('later-upgrade', 2000, { affiliate_id: AFF, upgrade_pass_id: 'reassigned', quote_lines: [line(0, { kind: 'upgrade', tierId: 'owned', participantIndex: 0 }), line(2000, { kind: 'addon', packageId: undefined, participantIndex: 0, activityIds: ['dinner'] })] });
  const data = { commerce_orders: [original, upgrade], commerce_passes: [pass('original', original.id, { participant_index: 0, affiliate_id: AFF }), pass('reassigned', original.id, { participant_index: 1, affiliate_id: OLD, affiliate_name: 'Seconda scuola' })], commerce_entitlements: [right('original-ws', 'original', original.id), right('reassigned-ws', 'reassigned', original.id), right('later-dinner', 'reassigned', upgrade.id, 'dinner')], meraki_refunds: [refund('upgrade-partial', upgrade.id, 100)] };
  const fees = { 'pi:pi_later-upgrade': { feeCents: 33, complete: true } };
  const filteredApi = fixture(data, { fees }); const filtered = await filteredApi.load({ affiliateId: OLD, period: '7' });
  assert.deepEqual([filtered.metrics.grossCents, filtered.metrics.refundedCents, filtered.metrics.feesCents, filtered.metrics.netAfterFeesCents, filtered.metrics.paidOrders, filtered.metrics.validParticipants], [2000, 100, 33, 1867, 1, 0]);
  assert.equal(filtered.revenue.find(row => row.id === 'dinner').grossCents, 2000);
  assert.deepEqual(filteredApi.feeCalls[0], [{ id: 'pi:pi_later-upgrade', paymentIntent: 'pi_later-upgrade', sessionId: 'cs_later-upgrade', amountCents: 2000, refundedCents: 100 }]);
  const all = await fixture(data, { fees }).load({});
  assert.equal(all.metrics.grossCents, 12000); assert.equal(all.metrics.paidOrders, 2); assert.equal(all.metrics.validParticipants, 2);
  assert.equal(all.affiliates.find(row => row.id === OLD).grossCents, 6000); assert.equal(all.affiliates.find(row => row.id === OLD).validParticipants, 1);
  assert.equal((await fixture(data, { fees }).load({ affiliateId: AFF, period: '7' })).metrics.grossCents, 0);
});

test('a current legacy ticket overrides its reservation affiliate including an explicit return to direct purchases', async () => {
  const reservation = { ...order('reservation', 4500, { affiliate_id: AFF, affiliate_name: 'Snapshot affiliate', stripe_payment_intent: null, stripe_session_id: 'cs_shared' }), quote_lines: undefined };
  const issued = ticket('issued', 4500, { affiliate_id: OLD, affiliate_name: 'Scuola aggiornata', stripe_payment_intent: 'pi_shared', stripe_session_id: 'cs_shared' });
  const data = { ticket_reservations: [reservation], tickets: [issued], meraki_refunds: [refund('partial', null, 500, { ticket_reservation_id: reservation.id, payment_intent: 'pi_shared' })] };
  const fees = { 'pi:pi_shared': { feeCents: 100, complete: true } };
  const api = fixture(data, { fees }); const result = await api.load({ affiliateId: OLD });
  assert.deepEqual([result.metrics.grossCents, result.metrics.refundedCents, result.metrics.feesCents, result.metrics.paidOrders, result.metrics.validParticipants], [4500, 500, 100, 1, 1]);
  assert.equal(api.feeCalls[0].length, 1); assert.equal(result.affiliates[0].name, 'Scuola aggiornata');
  const direct = await fixture({ ...data, tickets: [{ ...issued, affiliate_id: null, affiliate_name: null }] }, { fees }).load({ affiliateId: 'direct' });
  assert.equal(direct.metrics.grossCents, 4500); assert.equal(direct.metrics.validParticipants, 1); assert.equal(direct.affiliates[0].id, 'direct');
  assert.equal((await fixture(data, { fees }).load({ affiliateId: AFF })).metrics.grossCents, 0);
});

test('a duplicate record for one mixed-group payment never duplicates allocated fees or captured revenue', async () => {
  const purchase = order('group', 10000, { affiliate_id: AFF, quote_lines: [line(6000, { participantIndex: 0 }), line(4000, { participantIndex: 1 })] });
  const duplicate = { ...purchase, id: 'duplicate' };
  const data = { commerce_orders: [purchase, duplicate], commerce_passes: [pass('a', purchase.id, { participant_index: 0, affiliate_id: AFF }), pass('b', purchase.id, { participant_index: 1, affiliate_id: OLD })] };
  const api = fixture(data, { fees: { 'pi:pi_group': { feeCents: 300, complete: true } } }); const result = await api.load({});
  assert.equal(result.metrics.grossCents, 10000); assert.equal(result.metrics.paidOrders, 1); assert.equal(result.metrics.feesCents, 300);
  assert.equal(result.affiliates.find(row => row.id === AFF).grossCents, 6000); assert.equal(result.affiliates.find(row => row.id === OLD).grossCents, 4000);
  assert.equal(api.feeCalls[0].length, 1);
});

test('moving a commerce person back to direct purchases overrides the original order and preserves a corrected dinner allocation', async () => {
  const purchase = reportingOrder('corrected-person');
  const original = plain(purchase);
  const data = { commerce_orders: [purchase], commerce_passes: [pass('current-direct', purchase.id, { participant_index: 0, affiliate_id: null, affiliate_name: null })], commerce_entitlements: [right('current-ws', 'current-direct', purchase.id), right('current-dinner', 'current-direct', purchase.id, 'dinner')] };
  const result = await fixture(data, { fees: { 'pi:pi_corrected-person': { feeCents: 300, complete: true } } }).load({ affiliateId: 'direct' });
  assert.equal(result.metrics.grossCents, 8000); assert.equal(result.metrics.validParticipants, 1); assert.equal(result.metrics.paidOrders, 1);
  assert.equal(result.affiliates[0].id, 'direct'); assert.equal(result.affiliates[0].netAfterFeesCents, 7700);
  assert.equal(result.revenue.find(row => row.id === 'dinner').grossCents, 2000);
  assert.equal(result.revenue.find(row => row.id === 'workshop').grossCents, 3231);
  assert.equal(result.revenue.find(row => row.id === 'masterclass').grossCents, 2769);
  assert.deepEqual(plain(purchase), original);
  assert.equal((await fixture(data).load({ affiliateId: AFF })).metrics.grossCents, 0);
  assert.ok(!result.notes.some(note => note.includes('più affiliati')));
});

test('historical per-person package order supports missing quote indices while an ambiguous mixed group fails explicitly', async () => {
  const purchase = order('historic-group', 12000, { affiliate_id: AFF, quote_lines: [line(6000), line(2000, { kind: 'addon', packageId: undefined, activityIds: ['dinner'] }), line(4000)] });
  const people = [pass('a', purchase.id, { participant_index: 0, affiliate_id: AFF }), pass('b', purchase.id, { participant_index: 1, affiliate_id: OLD })];
  const result = await fixture({ commerce_orders: [purchase], commerce_passes: people }).load({ affiliateId: OLD });
  assert.equal(result.metrics.grossCents, 4000); assert.equal(result.addons.length, 0);
  const ambiguous = { ...purchase, quote_lines: [line(12000, { quantity: 2 })] };
  const unindexed = people.map(person => ({ ...person, participant_index: null }));
  await assert.rejects(fixture({ commerce_orders: [ambiguous], commerce_passes: unindexed }).load({}), /Non è possibile ripartire l’acquisto tra gli affiliati/);
});

test('four historical masterclass purchases become two active masterclasses after a refund and a package upgrade', async () => {
  const mc = (cents = 3500, overrides = {}) => line(cents, { packageId: 'solo-mc', label: 'Masterclass · Early Bird', activityIds: ['mc'], participantIndex: 0, ...overrides });
  const combo = (cents = 6500, overrides = {}) => line(cents, { packageId: 'combo', label: 'Workshop + Masterclass · Early Bird', activityIds: ['ws', 'mc'], participantIndex: 0, ...overrides });
  const combinedOrders = Array.from({ length: 20 }, (_, index) => {
    const cents = index < 7 ? 6000 : 6500;
    return order(`combo-${index}`, cents, { quote_lines: [combo(cents)] });
  });
  const baseOrders = [order('refunded-mc', 3000, { state: 'refunded', quote_lines: [mc(3000)] }), ...['mc-a', 'mc-b', 'upgraded-mc'].map(id => order(id, 3500, { quote_lines: [mc()] }))];
  const upgrade = order('upgrade-combo', 3000, { created_at: '2026-10-22T10:00:00Z', upgrade_pass_id: 'person-upgraded-mc', quote_lines: [combo(3000, { kind: 'upgrade' })] });
  const people = [
    ...baseOrders.map(purchase => pass(`person-${purchase.id}`, purchase.id, { participant_index: 0, status: purchase.state === 'refunded' ? 'refunded' : 'paid', package_id: purchase.id === 'upgraded-mc' ? 'combo' : 'solo-mc', package_name: purchase.id === 'upgraded-mc' ? 'Workshop + Masterclass' : 'Masterclass', package_activity_ids: purchase.id === 'upgraded-mc' ? ['ws', 'mc'] : ['mc'] })),
    ...combinedOrders.map(purchase => pass(`person-${purchase.id}`, purchase.id, { participant_index: 0, package_id: 'combo', package_name: 'Workshop + Masterclass', package_activity_ids: ['ws', 'mc'] })),
  ];
  const accesses = [
    ...baseOrders.map(purchase => right(`${purchase.id}-mc`, `person-${purchase.id}`, purchase.id, 'mc', { status: purchase.state === 'refunded' ? 'refunded' : 'valid' })),
    right('upgrade-ws', 'person-upgraded-mc', upgrade.id),
    ...combinedOrders.flatMap(purchase => [right(`${purchase.id}-mc`, `person-${purchase.id}`, purchase.id, 'mc'), right(`${purchase.id}-ws`, `person-${purchase.id}`, purchase.id)]),
  ];
  const result = await fixture({ commerce_orders: [...combinedOrders, ...baseOrders, upgrade], commerce_passes: people, commerce_entitlements: accesses, meraki_refunds: [refund('mc-refund', 'refunded-mc', 3000)] }).load({ eventId: A });
  assert.deepEqual(plain(result.packages), [
    { id: `${A}:combo`, name: 'Workshop + Masterclass', count: 21, netCents: 133000 },
    { id: `${A}:solo-mc`, name: 'Masterclass', count: 2, netCents: 7000 },
  ]);
  assert.equal(result.packages.reduce((total, entry) => total + entry.count, 0), result.metrics.validParticipants);
  assert.equal(result.packages.reduce((total, entry) => total + entry.netCents, 0), result.metrics.netCents);
  assert.equal(result.tiers.reduce((total, entry) => total + entry.count, 0), 23);
  assert.equal(result.metrics.grossCents, 143000); assert.equal(result.metrics.refundedCents, 3000);
  assert.deepEqual([result.attendanceGroups[0].masterclassOnly, result.attendanceGroups[0].both], [2, 21]);
});

test('current registrations consolidate upgrades while nine dinners stay outside the main financial summary', async () => {
  const combo = (totalCents, overrides = {}) => line(totalCents, { packageId: 'combo', label: 'Workshop + Masterclass · Standard', activityIds: ['ws', 'mc'], ...overrides });
  const mc = (totalCents = 3500) => line(totalCents, { packageId: 'mc', label: 'Masterclass · Standard', activityIds: ['mc'] });
  const dinner = () => line(2000, { kind: 'addon', packageId: undefined, tierId: undefined, addonId: 'dinner', label: 'Cena', activityIds: ['dinner'] });
  const combined = Array.from({ length: 20 }, (_, index) => {
    const cents = index < 7 ? 6000 : 6500;
    return order(`combo-${index}`, cents + (index < 8 ? 2000 : 0), { quote_lines: [combo(cents), ...(index < 8 ? [dinner()] : [])] });
  });
  const base = [order('returned-mc', 3000, { state: 'refunded', quote_lines: [mc(3000)] }), ...['mc-a', 'mc-b', 'mc-c', 'mc-d', 'mc-e', 'upgraded-mc'].map(id => order(id, 3500, { quote_lines: [mc()] }))];
  const upgrade = order('upgrade', 3000, { created_at: '2026-10-22T10:00:00Z', upgrade_pass_id: 'person-upgraded-mc', quote_lines: [combo(3000, { kind: 'upgrade' })] });
  const laterDinner = order('later-dinner', 2000, { created_at: '2026-10-22T11:00:00Z', upgrade_pass_id: 'person-upgraded-mc', quote_lines: [dinner()] });
  const people = [...combined, ...base].map(purchase => {
    const isCombo = purchase.id.startsWith('combo-') || purchase.id === 'upgraded-mc';
    return pass(`person-${purchase.id}`, purchase.id, { participant_index: 0, status: purchase.state === 'refunded' ? 'refunded' : 'paid', package_id: isCombo ? 'combo' : 'mc', package_name: isCombo ? 'Workshop + Masterclass' : 'Masterclass', package_activity_ids: isCombo ? ['ws', 'mc'] : ['mc'] });
  });
  const accesses = [
    ...combined.flatMap((purchase, index) => [right(`${purchase.id}-ws`, `person-${purchase.id}`, purchase.id), right(`${purchase.id}-mc`, `person-${purchase.id}`, purchase.id, 'mc'), ...(index < 8 ? [right(`${purchase.id}-dinner`, `person-${purchase.id}`, purchase.id, 'dinner')] : [])]),
    ...base.map(purchase => right(`${purchase.id}-mc`, `person-${purchase.id}`, purchase.id, 'mc', { status: purchase.state === 'refunded' ? 'refunded' : 'valid' })),
    right('upgrade-ws', 'person-upgraded-mc', upgrade.id), right('later-dinner-access', 'person-upgraded-mc', laterDinner.id, 'dinner'),
  ];
  const fees = Object.fromEntries([
    ...combined.map((purchase, index) => [`pi:pi_${purchase.id}`, { feeCents: index < 7 ? 196 : index === 7 ? 208 : 100, complete: true }]),
    ...base.map(purchase => [`pi:pi_${purchase.id}`, { feeCents: 150, complete: true }]),
    ['pi:pi_upgrade', { feeCents: 302, complete: true }], ['pi:pi_later-dinner', { feeCents: 49, complete: true }],
  ]);
  const result = await fixture({ commerce_orders: [...combined, ...base, upgrade, laterDinner], commerce_passes: people, commerce_entitlements: accesses, meraki_refunds: [refund('returned', 'returned-mc', 3000)] }, { fees }).load({ eventId: A });
  const financials = summary => [summary.grossCents, summary.refundedCents, summary.feesCents, summary.netAfterFeesCents];
  assert.equal(result.registrationSummary.count, 26); assert.equal(result.dinnerSummary.count, 9);
  assert.deepEqual(financials(result.registrationSummary), [153500, 3000, 3740, 146760]);
  assert.deepEqual(financials(result.dinnerSummary), [18000, 0, 441, 17559]);
  assert.deepEqual(financials(result.metrics), [171500, 3000, 4181, 164319], 'the original ledger still reconciles all captured payments and refunds');
  assert.deepEqual(plain(result.packages.map(entry => [entry.count, entry.netCents])), [[21, 133000], [5, 17500]]);
  assert.equal(result.addons[0].count, 9);
  assert.deepEqual(plain(result.eventStats[0].registrationSummary), plain(result.registrationSummary));
  assert.deepEqual(plain(result.affiliates.find(row => row.id === 'direct').dinnerSummary), plain(result.dinnerSummary));
  const firstDay = result.trend.find(row => row.date === '2026-10-21'); const laterDay = result.trend.find(row => row.date === '2026-10-22');
  assert.equal(firstDay.registrationSummary.count, 26); assert.equal(firstDay.dinnerSummary.count, 9);
  assert.equal(laterDay.registrationSummary.count, 0); assert.equal(laterDay.dinnerSummary.count, 0);
  assert.equal(firstDay.dinnerSummary.grossCents, 16000); assert.equal(laterDay.dinnerSummary.grossCents, 2000);
});

test('registration and dinner refunds and fees use the same cent allocation for affiliate filters and parent summaries', async () => {
  const purchase = order('four-cent-group', 4, { affiliate_id: AFF, quote_lines: [
    line(1, { kind: 'addon', participantIndex: 0, packageId: undefined, addonId: 'dinner', activityIds: ['dinner'] }), line(1, { participantIndex: 0 }),
    line(1, { participantIndex: 1 }), line(1, { kind: 'addon', participantIndex: 1, packageId: undefined, addonId: 'dinner', activityIds: ['dinner'] }),
  ] });
  const data = { commerce_orders: [purchase], commerce_passes: [pass('a', purchase.id, { participant_index: 0, affiliate_id: AFF }), pass('b', purchase.id, { participant_index: 1, affiliate_id: OLD })], commerce_entitlements: [right('a-ws', 'a', purchase.id), right('a-dinner', 'a', purchase.id, 'dinner'), right('b-ws', 'b', purchase.id), right('b-dinner', 'b', purchase.id, 'dinner')], meraki_refunds: [refund('one-cent', purchase.id, 1)] };
  const fees = { 'pi:pi_four-cent-group': { feeCents: 1, complete: true } };
  const all = await fixture(data, { fees }).load({ eventId: A });
  assert.deepEqual([all.registrationSummary.grossCents, all.registrationSummary.refundedCents, all.registrationSummary.feesCents], [2, 0, 0]);
  assert.deepEqual([all.dinnerSummary.grossCents, all.dinnerSummary.refundedCents, all.dinnerSummary.feesCents], [2, 1, 1]);
  for (const key of ['registrationSummary', 'dinnerSummary']) {
    for (const field of ['count', 'grossCents', 'refundedCents', 'netCents', 'feesCents', 'netAfterFeesCents']) assert.equal(all.affiliates.reduce((sum, row) => sum + row[key][field], 0), all[key][field], `${key}.${field}`);
    assert.deepEqual(plain(all.eventStats[0][key]), plain(all[key]));
    assert.deepEqual(plain(all.trend[0][key]), plain(all[key]));
  }
  for (const affiliateId of [AFF, OLD]) {
    const scoped = await fixture(data, { fees }).load({ eventId: A, affiliateId });
    const affiliate = all.affiliates.find(row => row.id === affiliateId);
    assert.deepEqual(plain(scoped.registrationSummary), plain(affiliate.registrationSummary));
    assert.deepEqual(plain(scoped.dinnerSummary), plain(affiliate.dinnerSummary));
  }
});

test('missing dinner fees leave the registration financial summary available', async () => {
  const initial = order('ws', 1000); const addon = order('dinner', 2000, { upgrade_pass_id: 'person', quote_lines: [line(2000, { kind: 'addon', packageId: undefined, addonId: 'dinner', activityIds: ['dinner'] })] });
  const result = await fixture({ commerce_orders: [initial, addon], commerce_passes: [pass('person', initial.id)], commerce_entitlements: [right('ws-access', 'person', initial.id), right('dinner-access', 'person', addon.id, 'dinner')] }, { fees: { 'pi:pi_ws': { feeCents: 20, complete: true }, 'pi:pi_dinner': { feeCents: 50, complete: false } } }).load({ eventId: A });
  assert.equal(result.registrationSummary.count, 1); assert.equal(result.dinnerSummary.count, 1);
  assert.equal(result.registrationSummary.netAfterFeesCents, 980); assert.equal(result.registrationSummary.missingFeePayments, 0);
  assert.equal(result.dinnerSummary.netAfterFeesCents, null); assert.equal(result.dinnerSummary.missingFeePayments, 1);
  assert.equal(result.metrics.netAfterFeesCents, null);
  assert.equal(result.eventStats[0].registrationSummary.netAfterFeesCents, 980);
  assert.equal(result.affiliates.find(row => row.id === 'direct').registrationSummary.netAfterFeesCents, 980);
});

test('historical unreadable revenue stays in activities while a free dinner counts separately from registrations', async () => {
  const initial = order('historical', 1000, { quote_lines: [] });
  const freeDinner = order('free-dinner', 0, { upgrade_pass_id: 'historical-person', quote_lines: [line(0, { kind: 'addon', packageId: undefined, addonId: 'dinner', activityIds: ['dinner'] })] });
  const result = await fixture({ commerce_orders: [initial, freeDinner], commerce_passes: [pass('historical-person', initial.id)], commerce_entitlements: [right('unknown-activity', 'historical-person', initial.id, 'historical-activity'), right('free-dinner-access', 'historical-person', freeDinner.id, 'dinner')], tickets: [ticket('legacy-person', 500)] }).load({ eventId: A });
  assert.equal(result.registrationSummary.count, 2, 'historical non-dinner access and a legacy ticket each retain one registration');
  assert.equal(result.registrationSummary.grossCents, 1500); assert.equal(result.registrationSummary.netCents, 1500);
  assert.equal(result.revenue.find(row => row.id === 'unallocated').grossCents, 1500);
  assert.equal(result.dinnerSummary.count, 1); assert.equal(result.dinnerSummary.grossCents, 0);
  assert.equal(result.metrics.paidOrders, 2);
});

test('a refunded package upgrade restores the surviving original package without counting the refund or the failed change', async () => {
  const initial = order('initial-mc', 3500, { quote_lines: [line(3500, { packageId: 'mc', label: 'Masterclass · Early', activityIds: ['mc'] })] });
  const upgraded = order('returned-upgrade', 3000, { state: 'refunded', created_at: '2026-10-22T10:00:00Z', upgrade_pass_id: 'person', quote_lines: [line(3000, { kind: 'upgrade', packageId: 'combo', label: 'Combinata · Early', activityIds: ['ws', 'mc'] })] });
  const result = await fixture({
    commerce_orders: [initial, upgraded],
    commerce_passes: [pass('person', initial.id, { package_id: 'mc', package_name: 'Masterclass', package_activity_ids: ['mc'] })],
    commerce_entitlements: [right('mc', 'person', initial.id, 'mc'), right('ws', 'person', upgraded.id, 'ws', { status: 'refunded' })],
    meraki_refunds: [refund('returned', upgraded.id, 3000)],
  }).load({ eventId: A });
  assert.deepEqual(plain(result.packages), [{ id: `${A}:mc`, name: 'Masterclass', count: 1, netCents: 3500 }]);
  assert.equal(result.tiers[0].netCents, 3500); assert.equal(result.tiers[0].count, 1);
  assert.equal(result.metrics.grossCents, 6500); assert.equal(result.metrics.refundedCents, 3000);
});

test('partial monetary refunds preserve an active formula while free formulas remain valid people', async () => {
  const result = await fixture({
    commerce_orders: [order('partial-money', 4500), order('free-formula', 0), order('never-issued', 1000)],
    commerce_passes: [pass('partial-person', 'partial-money', { package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }), pass('free-person', 'free-formula', { package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] })],
    commerce_entitlements: [right('partial-ws', 'partial-person', 'partial-money', 'ws', { status: 'used' }), right('free-ws', 'free-person', 'free-formula')],
    meraki_refunds: [refund('partial-success', 'partial-money', 1000), refund('partial-pending', 'partial-money', 3500, { status: 'pending' })],
  }).load({ eventId: A });
  assert.deepEqual(plain(result.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 2, netCents: 3500 }]);
  assert.equal(result.metrics.validParticipants, 2);
  assert.equal(result.registrationSummary.count, 2); assert.equal(result.dinnerSummary.count, 0);
  assert.equal(result.metrics.grossCents, 5500, 'captured but unissued funds remain in financial reporting only');
  assert.equal(result.metrics.refundedCents, 1000);
});

test('revoked package admissions cannot reappear as a complete formula or through a surviving dinner extra', async () => {
  const partial = await fixture({
    commerce_orders: [order('partial-access', 6500, { quote_lines: [line(6500, { packageId: 'combo', label: 'Combinata · Early', activityIds: ['ws', 'mc'] })] })],
    commerce_passes: [pass('partial-person', 'partial-access', { package_id: 'combo', package_name: 'Combinata', package_activity_ids: ['ws', 'mc'] })],
    commerce_entitlements: [right('remaining-ws', 'partial-person', 'partial-access'), right('revoked-mc', 'partial-person', 'partial-access', 'mc', { status: 'refunded' })],
    meraki_refunds: [refund('partial-access-return', 'partial-access', 3000)],
  }).load({ eventId: A });
  assert.deepEqual(plain(partial.packages), [{ id: `${A}:partial:ws`, name: 'Accessi parziali: Workshop', count: 1, netCents: 3500 }]);
  assert.equal(partial.tiers.length, 0);

  const dinner = await fixture({
    commerce_orders: [order('returned-base', 3500, { state: 'refunded', quote_lines: [line(3500, { packageId: 'mc', label: 'Masterclass', activityIds: ['mc'] })] }), order('kept-dinner', 2000, { upgrade_pass_id: 'dinner-person', quote_lines: [line(0, { kind: 'upgrade', packageId: 'mc', tierId: 'owned', activityIds: ['mc'] }), line(2000, { kind: 'addon', packageId: undefined, tierId: undefined, addonId: 'dinner', label: 'Cena', activityIds: ['dinner'] })] })],
    commerce_passes: [pass('dinner-person', 'returned-base', { package_id: 'mc', package_name: 'Masterclass', package_activity_ids: ['mc'] })],
    commerce_entitlements: [right('returned-mc', 'dinner-person', 'returned-base', 'mc', { status: 'refunded' }), right('kept-dinner', 'dinner-person', 'kept-dinner', 'dinner')],
    meraki_refunds: [refund('base-return', 'returned-base', 3500)],
  }).load({ eventId: A });
  assert.deepEqual(plain(dinner.packages), []); assert.deepEqual(plain(dinner.tiers), []);
  assert.deepEqual(plain(dinner.addons), [{ id: `${A}:dinner`, name: 'Cena', count: 1, netCents: 2000 }]);
  assert.equal(dinner.metrics.validParticipants, 1); assert.equal(dinner.attendanceGroups[0].otherParticipants, 1);
  assert.equal(dinner.registrationSummary.count, 0); assert.equal(dinner.dinnerSummary.count, 1);
  assert.equal(dinner.registrationSummary.grossCents, 3500); assert.equal(dinner.registrationSummary.refundedCents, 3500);
  assert.equal(dinner.dinnerSummary.netCents, 2000);
});

test('current package and extras follow the original group cohort and current person affiliate across later upgrades', async () => {
  const initial = order('group-start', 7000, { affiliate_id: AFF, created_at: '2026-10-01T10:00:00Z', quote_lines: [line(3500, { participantIndex: 0, packageId: 'mc', label: 'Masterclass · Early', activityIds: ['mc'] }), line(3500, { participantIndex: 1, packageId: 'mc', label: 'Masterclass · Early', activityIds: ['mc'] })] });
  const upgrade = order('package-change', 3000, { affiliate_id: AFF, created_at: '2026-10-15T10:00:00Z', upgrade_pass_id: 'moved-person', quote_lines: [line(3000, { kind: 'upgrade', packageId: 'combo', label: 'Combinata · Standard', tierId: 'standard', activityIds: ['ws', 'mc'], participantIndex: 0 })] });
  const dinner = order('later-dinner', 2000, { affiliate_id: AFF, upgrade_pass_id: 'moved-person', quote_lines: [line(0, { kind: 'upgrade', tierId: 'owned', packageId: 'combo', activityIds: ['ws', 'mc'], participantIndex: 0 }), line(2000, { kind: 'addon', packageId: undefined, tierId: undefined, addonId: 'dinner', label: 'Cena', activityIds: ['dinner'], participantIndex: 0 })] });
  const data = {
    commerce_orders: [initial, upgrade, dinner],
    commerce_passes: [pass('moved-person', initial.id, { participant_index: 0, affiliate_id: OLD, package_id: 'combo', package_name: 'Combinata', package_activity_ids: ['ws', 'mc'] }), pass('unchanged-person', initial.id, { participant_index: 1, affiliate_id: AFF, package_id: 'mc', package_name: 'Masterclass', package_activity_ids: ['mc'] })],
    commerce_entitlements: [right('moved-mc', 'moved-person', initial.id, 'mc'), right('unchanged-mc', 'unchanged-person', initial.id, 'mc'), right('moved-ws', 'moved-person', upgrade.id), right('moved-dinner', 'moved-person', dinner.id, 'dinner')],
  };
  const current = await fixture(data).load({ eventId: A, affiliateId: OLD });
  assert.equal(current.registrationSummary.count, 1); assert.equal(current.dinnerSummary.count, 1);
  assert.deepEqual(plain(current.packages), [{ id: `${A}:combo`, name: 'Combinata', count: 1, netCents: 6500 }]);
  assert.deepEqual(plain(current.tiers), [{ id: `${A}:combo:standard`, name: 'Combinata · Standard', count: 1, netCents: 6500 }]);
  assert.deepEqual(plain(current.addons), [{ id: `${A}:dinner`, name: 'Cena', count: 1, netCents: 2000 }]);
  const otherPerson = await fixture(data).load({ eventId: A, affiliateId: AFF });
  assert.deepEqual(plain(otherPerson.packages), [{ id: `${A}:mc`, name: 'Masterclass', count: 1, netCents: 3500 }]);
  assert.deepEqual(plain(otherPerson.addons), []);
  const firstPurchase = await fixture(data).load({ eventId: A, affiliateId: OLD, period: 'custom', from: '2026-10-01', to: '2026-10-01' });
  assert.equal(firstPurchase.registrationSummary.count, 1); assert.equal(firstPurchase.dinnerSummary.count, 1);
  assert.equal(firstPurchase.registrationSummary.grossCents, 3500); assert.equal(firstPurchase.dinnerSummary.grossCents, 0);
  assert.deepEqual(plain(firstPurchase.packages), plain(current.packages)); assert.deepEqual(plain(firstPurchase.addons), plain(current.addons));
  assert.equal(firstPurchase.metrics.grossCents, 3500, 'financial KPIs retain transaction dates while current formulas include later upgrades');
  const onlyLaterPayment = await fixture(data).load({ eventId: A, affiliateId: OLD, period: 'custom', from: '2026-10-21', to: '2026-10-21' });
  assert.equal(onlyLaterPayment.metrics.grossCents, 2000); assert.equal(onlyLaterPayment.metrics.validParticipants, 0);
  assert.equal(onlyLaterPayment.registrationSummary.count, 0); assert.equal(onlyLaterPayment.dinnerSummary.count, 0);
  assert.equal(onlyLaterPayment.registrationSummary.grossCents, 0); assert.equal(onlyLaterPayment.dinnerSummary.grossCents, 2000);
  assert.deepEqual(plain(onlyLaterPayment.packages), []); assert.deepEqual(plain(onlyLaterPayment.addons), []);
});

test('active product refunds use the same affiliate-first cent rounding as financial group reporting', async () => {
  const purchase = order('rounding-group', 9000, { affiliate_id: AFF, quote_lines: [
    line(5000, { participantIndex: 0 }), line(3000, { participantIndex: 1 }), line(1000, { participantIndex: 2 }),
  ] });
  const data = {
    commerce_orders: [purchase],
    commerce_passes: [
      pass('first-a', purchase.id, { participant_index: 0, affiliate_id: AFF, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
      pass('middle-b', purchase.id, { participant_index: 1, affiliate_id: OLD, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
      pass('last-a', purchase.id, { participant_index: 2, affiliate_id: AFF, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
    ],
    commerce_entitlements: [right('first-ws', 'first-a', purchase.id), right('middle-ws', 'middle-b', purchase.id), right('last-ws', 'last-a', purchase.id)],
    meraki_refunds: [refund('one-cent', purchase.id, 1)],
  };
  const a = await fixture(data).load({ eventId: A, affiliateId: AFF });
  const b = await fixture(data).load({ eventId: A, affiliateId: OLD });
  assert.deepEqual(plain(a.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 2, netCents: 6000 }]);
  assert.deepEqual(plain(b.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 1, netCents: 2999 }]);
  assert.equal(a.metrics.netCents, a.packages[0].netCents); assert.equal(b.metrics.netCents, b.packages[0].netCents);
  assert.equal(a.metrics.refundedCents, 0); assert.equal(b.metrics.refundedCents, 1);
  const all = await fixture(data).load({ eventId: A });
  assert.deepEqual(plain(all.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 3, netCents: 8999 }]);
  assert.equal(all.packages[0].netCents, all.metrics.netCents);
});

test('successive paid package upgrades with unchanged activities retain every delta in the final package and tier', async () => {
  const base = order('original-ws', 3500, { created_at: '2026-10-21T10:00:00Z', quote_lines: [line(3500)] });
  const premium = order('premium-ws', 1000, { created_at: '2026-10-21T11:00:00Z', upgrade_pass_id: 'premium-person', quote_lines: [line(1000, { kind: 'upgrade', packageId: 'premium', label: 'Workshop Premium · Standard', tierId: 'standard' })] });
  const premium2 = order('premium2-ws', 1000, { created_at: '2026-10-21T12:00:00Z', upgrade_pass_id: 'premium-person', quote_lines: [line(1000, { kind: 'upgrade', packageId: 'premium2', label: 'Workshop Premium 2 · Late', tierId: 'late' })] });
  const result = await fixture({
    commerce_orders: [premium2, base, premium],
    commerce_passes: [pass('premium-person', base.id, { package_id: 'premium2', package_name: 'Workshop Premium 2', package_activity_ids: ['ws'] })],
    commerce_entitlements: [right('original-ws-access', 'premium-person', base.id)],
  }).load({ eventId: A });
  assert.deepEqual(plain(result.packages), [{ id: `${A}:premium2`, name: 'Workshop Premium 2', count: 1, netCents: 5500 }]);
  assert.deepEqual(plain(result.tiers), [{ id: `${A}:premium2:late`, name: 'Workshop Premium 2 · Late', count: 1, netCents: 5500 }]);
  assert.equal(result.metrics.netCents, 5500); assert.equal(result.metrics.paidOrders, 3); assert.equal(result.metrics.validParticipants, 1);
  assert.equal(result.activities.find(activity => activity.id === 'ws').occupied, 1);
});

test('an ambiguous unindexed historical group outside the selected cohort cannot block unrelated current formulas', async () => {
  const historical = order('old-ambiguous-group', 10000, { affiliate_id: AFF, created_at: '2026-09-01T10:00:00Z', quote_lines: [line(10000, { quantity: 2 })] });
  const selected = order('selected-purchase', 4000);
  const data = {
    commerce_orders: [historical, selected],
    commerce_passes: [
      pass('old-a', historical.id, { participant_index: null, affiliate_id: AFF, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
      pass('old-b', historical.id, { participant_index: null, affiliate_id: OLD, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
      pass('selected-person', selected.id, { participant_index: 0, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
    ],
    commerce_entitlements: [right('old-a-ws', 'old-a', historical.id), right('old-b-ws', 'old-b', historical.id), right('selected-ws', 'selected-person', selected.id)],
  };
  const result = await fixture(data).load({ eventId: A, period: 'custom', from: '2026-10-21', to: '2026-10-21' });
  assert.deepEqual(plain(result.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 1, netCents: 4000 }]);
  assert.equal(result.metrics.netCents, 4000); assert.equal(result.metrics.paidOrders, 1); assert.equal(result.metrics.validParticipants, 1);
  assert.equal(result.attendanceGroups[0].currentParticipants, 3, 'current event occupancy still includes people outside the selected purchase cohort');
  await assert.rejects(fixture(data).load({ eventId: A }), /Non è possibile ripartire l’acquisto tra gli affiliati/);
});

test('unfulfilled same-activity upgrades awaiting refund never increase the active package amount', async () => {
  for (const state of ['refund_required', 'refund_pending']) {
    const initial = order('unchanged-workshop', 3500);
    const attempted = order('unfulfilled-premium', 1000, { state, upgrade_pass_id: 'unchanged-person', created_at: '2026-10-22T10:00:00Z', quote_lines: [line(1000, { kind: 'upgrade', packageId: 'premium', label: 'Workshop Premium · Standard', tierId: 'standard' })] });
    const result = await fixture({
      commerce_orders: [initial, attempted],
      commerce_passes: [pass('unchanged-person', initial.id, { package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] })],
      commerce_entitlements: [right('unchanged-ws', 'unchanged-person', initial.id)],
    }).load({ eventId: A });
    assert.deepEqual(plain(result.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 1, netCents: 3500 }], state);
    assert.deepEqual(plain(result.tiers), [{ id: `${A}:ws:early`, name: 'Workshop · Early Bird', count: 1, netCents: 3500 }], state);
    assert.equal(result.metrics.netCents, 4500, state); assert.equal(result.metrics.refundedCents, 0, state);
    assert.equal(result.metrics.validParticipants, 1, state);
  }
});

test('refunding one selected group member leaves the other active formula at its full paid amount', async () => {
  for (const aggregate of [false, true]) {
    const purchase = order('targeted-group', 7000, { affiliate_id: AFF, quote_lines: aggregate ? [line(7000, { quantity: 2 })] : [line(3500, { participantIndex: 0 }), line(3500, { participantIndex: 1 })] });
    const result = await fixture({
      commerce_orders: [purchase],
      commerce_passes: [
        pass('remaining-person', purchase.id, { participant_index: 0, affiliate_id: AFF, package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
        pass('refunded-person', purchase.id, { participant_index: 1, affiliate_id: AFF, status: 'refunded', package_id: 'ws', package_name: 'Workshop', package_activity_ids: ['ws'] }),
      ],
      commerce_entitlements: [right('remaining-ws', 'remaining-person', purchase.id), right('refunded-ws', 'refunded-person', purchase.id, 'ws', { status: 'refunded' })],
      meraki_refunds: [refund('one-member-return', purchase.id, 3500, { revoke_entitlement_ids: ['refunded-ws'] })],
    }).load({ eventId: A });
    assert.deepEqual(plain(result.packages), [{ id: `${A}:ws`, name: 'Workshop', count: 1, netCents: 3500 }], `aggregate=${aggregate}`);
    assert.equal(result.tiers[0].count, 1); assert.equal(result.tiers[0].netCents, 3500);
    assert.equal(result.metrics.netCents, 3500); assert.equal(result.metrics.refundedCents, 3500);
    assert.equal(result.metrics.validParticipants, 1); assert.equal(result.attendanceGroups[0].workshopOnly, 1);
  }
});
