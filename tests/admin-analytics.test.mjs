import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date { static now() { return Date.parse('2026-10-22T12:00:00Z'); } }
function compile(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), Date: FixedDate, Intl, Map, Set });
  return module.exports;
}
const affiliates = compile('lib/events/affiliates.ts');
const i18n = compile('lib/i18n-utils.ts');
const romeTime = compile('lib/commerce/rome-time.ts');
const A = '10000000-0000-4000-8000-000000000001', B = '10000000-0000-4000-8000-000000000002';
const AFF = '20000000-0000-4000-8000-000000000001', OLD = '20000000-0000-4000-8000-000000000002';
const event = (id = A, overrides = {}) => ({ id, titolo: { it: 'Meraki Day', en: 'Meraki Day EN' }, data_inizio: '2026-12-19T11:30:00Z', data_fine: '2026-12-19T17:00:00Z', attivo: true, canceled_at: null, capacity: 5, affiliates: [{ id: AFF, name: 'Martina', active: true }], activities: [{ id: 'ws', name: 'Workshop', capacity: 3 }, { id: 'mc', name: 'Masterclass', capacity: 2 }, { id: 'dinner', name: 'Cena', capacity: 1 }], ...overrides });
const line = (totalCents, overrides = {}) => ({ kind: 'package', label: 'Workshop · Early Bird', quantity: 1, totalCents, packageId: 'ws', tierId: 'early', activityIds: ['ws'], ...overrides });
const order = (id, amount_cents, overrides = {}) => ({ id, event_id: A, state: 'fulfilled', amount_cents, created_at: '2026-10-21T10:00:00Z', stripe_payment_intent: `pi_${id}`, stripe_session_id: `cs_${id}`, refund_status: null, affiliate_id: null, affiliate_name: null, upgrade_pass_id: null, quote_lines: [line(amount_cents)], buyer_email: 'PRIVATE@example.test', participants: [{ firstName: 'PRIVATE-NAME' }], ...overrides });
const pass = (id, order_id, overrides = {}) => ({ id, order_id, event_id: A, status: 'paid', created_at: '2026-10-21T10:05:00Z', affiliate_id: null, affiliate_name: null, qr_code: 'PRIVATE-QR-CAPABILITY', first_name: 'PRIVATE-NAME', ...overrides });
const right = (id, pass_id, order_id, activity_id = 'ws', overrides = {}) => ({ id, pass_id, order_id, activity_id, activity_name: activity_id === 'mc' ? 'Masterclass' : activity_id === 'dinner' ? 'Cena' : 'Workshop', event_id: A, status: 'valid', checked_in_at: null, menu_choice: 'PRIVATE-MENU', ...overrides });
const ticket = (id, amount_cents, overrides = {}) => ({ id, event_id: A, status: 'paid', amount_cents, created_at: '2026-10-21T10:06:00Z', used_at: null, stripe_payment_intent: `pi_${id}`, stripe_session_id: `cs_${id}`, affiliate_id: null, affiliate_name: null, buyer_email: 'PRIVATE@example.test', qr_code: 'PRIVATE-QR-CAPABILITY', ...overrides });
const refund = (id, order_id, amount_cents, overrides = {}) => ({ id, event_id: A, order_id, ticket_reservation_id: null, payment_intent: `pi_${order_id}`, amount_cents, status: 'succeeded', stripe_refund_id: `re_${id}`, reason: 'PRIVATE-REASON', ...overrides });

function fixture(data = {}, { denied = false, fail } = {}) {
  const calls = []; let authorized = false;
  const tables = { events: [event()], commerce_orders: [], ticket_reservations: [], commerce_passes: [], commerce_entitlements: [], tickets: [], meraki_refunds: [], commerce_payment_refunds: [], ticket_payment_refunds: [], commerce_waitlist: [], leads: [], orders: [], marketing_contacts: [], ...data };
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
  const api = compile('lib/admin/analytics.ts', { 'server-only': {}, '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => { if (denied) throw new Error('Accesso negato'); authorized = true; return db; } }, '@/lib/i18n-utils': i18n, '@/lib/commerce/rome-time': romeTime, '@/lib/events/affiliates': affiliates });
  return { load: input => api.loadAdminAnalytics({ locale: 'it', ...input }), calls };
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
    commerce_passes: [pass('person-1', 'base', { affiliate_id: AFF, affiliate_name: 'Martina' }), pass('person-2', 'partial'), pass('person-3', 'full', { status: 'refunded' }), pass('person-free', 'free')],
    commerce_entitlements: [right('r1', 'person-1', 'base', 'ws', { status: 'used' }), right('r2', 'person-1', 'base', 'mc'), right('r3', 'person-1', 'upgrade', 'dinner'), right('r4', 'person-2', 'partial'), right('r5', 'person-3', 'full', 'ws', { status: 'refunded' }), right('r6', 'person-free', 'free')],
    meraki_refunds: [refund('partial', 'partial', 1000), refund('partial-pending', 'partial', 900, { status: 'pending' }), refund('partial-failed', 'partial', 800, { status: 'failed' }), refund('full1', 'full', 1500), refund('full2', 'full', 1500), refund('full2', 'full', 1500), refund('legacyrefund', null, 2000, { ticket_reservation_id: 'legacy-refund', payment_intent: 'pi_legacy-refund' })],
    commerce_payment_refunds: [{ payment_intent: 'pi_full', status: 'succeeded' }], ticket_payment_refunds: [{ payment_intent: 'pi_legacy-refund' }],
    commerce_waitlist: [{ id: 'w1', event_id: A, status: 'waiting', created_at: base.created_at }, { id: 'w2', event_id: B, status: 'waiting', created_at: base.created_at }, { id: 'w3', event_id: A, status: 'notified', created_at: base.created_at }],
  };
  const api = fixture(data); const result = await api.load({ period: 'all' });
  assert.deepEqual(plain(result.metrics), { grossCents: 29500, refundedCents: 6000, netCents: 23500, paidOrders: 8, validParticipants: 5, checkedInParticipants: 2, waiting: 2, pendingOrders: 1, expiredOrders: 1, failedOrders: 1 });
  assert.equal(result.addons[0].count, 2); assert.equal(result.addons[0].grossCents, 4000);
  assert.equal(result.packages.reduce((sum, item) => sum + item.grossCents, 0) + result.addons.reduce((sum, item) => sum + item.grossCents, 0), result.metrics.grossCents);
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
});

test('a shared Stripe session joins historical rows with a missing intent before deduplicating revenue and refunds', async () => {
  const api = fixture({
    commerce_orders: [order('original', 6500, { stripe_payment_intent: null, stripe_session_id: 'cs_shared' })],
    ticket_reservations: [order('old-reservation', 6500, { stripe_payment_intent: 'pi_shared', stripe_session_id: 'cs_shared' })],
    tickets: [ticket('old-ticket', 6500, { stripe_payment_intent: 'pi_shared', stripe_session_id: 'cs_shared' })],
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
  const result = await fixture({ commerce_orders: [order('discounted', 6501, { quote_lines: [line(4500), line(3500, { packageId: 'mc', label: 'Masterclass · Early Bird', activityIds: ['mc'] })] }), order('dinner-only', 2000, { quote_lines: [line(0, { kind: 'upgrade', tierId: 'owned' }), line(2000, { kind: 'addon', label: 'Cena', activityIds: ['dinner'] })] }), order('free', 0)] }).load({});
  assert.equal(result.metrics.grossCents, 8501); assert.equal(result.metrics.paidOrders, 2);
  assert.equal(result.packages.reduce((sum, item) => sum + item.grossCents, 0), 6501); assert.equal(result.addons[0].grossCents, 2000);
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
