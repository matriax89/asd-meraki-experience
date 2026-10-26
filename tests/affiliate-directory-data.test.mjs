import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
function compile(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), Map, Set, Date });
  return module.exports;
}
const affiliates = compile('lib/events/affiliates.ts');
const i18n = compile('lib/i18n-utils.ts');
const ids = {
  a: '10000000-0000-4000-8000-000000000001', b: '10000000-0000-4000-8000-000000000002',
  affiliate: '20000000-0000-4000-8000-000000000001', disabled: '20000000-0000-4000-8000-000000000002', archived: '20000000-0000-4000-8000-000000000003',
};
const event = (id = ids.a, configured = [{ id: ids.affiliate, name: 'Martina aggiornata', active: true }, { id: ids.disabled, name: 'Affiliato disattivato', active: false }]) => ({ id, titolo: { it: 'Meraki Day', en: 'Meraki Day EN' }, data_inizio: '2026-12-19T11:30:00Z', affiliates: configured, canceled_at: null });
const legacy = (id, overrides = {}) => ({ id, event_id: ids.a, affiliate_id: ids.affiliate, affiliate_name: 'Martina originale', status: 'paid', created_at: '2026-10-01T10:00:00Z', buyer_nome: 'Ada', buyer_cognome: 'Rossi', buyer_email: 'buyer@example.test', qr_code: 'PRIVATE-CAPABILITY', ...overrides });
const pass = (id, overrides = {}) => ({ ...legacy(id), first_name: 'Ada', last_name: 'Rossi', package_name: 'Workshop + Masterclass', commerce_orders: { buyer_email: 'purchaser@example.test' }, commerce_entitlements: [{ activity_id: 'workshop', activity_name: 'Workshop', status: 'valid', checked_in_at: null, menu_choice: null }], ...overrides });

function fixture({ events = [event()], tickets = [], passes = [], contacts = [], commissions = [], denied = false, fail } = {}) {
  const calls = [];
  let authenticated = false;
  const tables = { events, tickets, commerce_passes: passes, commerce_attendee_contacts: contacts, event_affiliate_commissions: commissions };
  const db = { from(table) {
    assert.ok(authenticated, 'private queries must follow the verified staff authorization');
    const call = { table, filters: [], orders: [], fields: '' }; calls.push(call);
    const query = {
      select(fields) { call.fields = fields; return this; },
      eq(key, value) { call.filters.push(['eq', key, value]); return this; },
      is(key, value) { call.filters.push(['is', key, value]); return this; },
      in(key, values) { call.filters.push(['in', key, values]); return this; },
      order(key, options) { call.orders.push([key, options?.ascending !== false]); return this; },
      range(from, to) { call.range = [from, to]; return Promise.resolve(resolve(false)); },
      maybeSingle() { return Promise.resolve(resolve(true)); },
    };
    function resolve(single) {
      if (fail?.(call)) return { data: null, error: { code: 'TEST-QUERY-FAILURE' } };
      let rows = (tables[table] || []).filter(row => call.filters.every(([kind, key, value]) => kind === 'in' ? value.includes(row[key]) : row[key] === value));
      rows = [...rows].sort((a, b) => { for (const [key, ascending] of call.orders) { const result = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (result) return ascending ? result : -result; } return 0; });
      if (single) return { data: rows[0] || null, error: null };
      return { data: rows.slice(call.range[0], call.range[1] + 1), error: null };
    }
    return query;
  } };
  const api = compile('lib/events/affiliate-directory.ts', {
    'server-only': {}, '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => { if (denied) throw new Error('Accesso negato'); authenticated = true; return db; } },
    '@/lib/i18n-utils': i18n, './affiliates': affiliates,
  });
  return { ...api, calls };
}

test('staff authorization precedes every directory/detail read, including invalid identifiers', async () => {
  for (const method of ['loadAffiliateDirectory', 'loadAffiliateParticipants']) {
    const api = fixture({ denied: true });
    await assert.rejects(api[method]('it', 'invalid', 'invalid'), /Accesso negato/);
    assert.equal(api.calls.length, 0);
  }
  const api = fixture();
  assert.equal(await api.loadAffiliateParticipants('it', 'invalid', ids.affiliate), null);
  assert.equal(await api.loadAffiliateParticipants('it', ids.a, 'invalid'), null);
  await assert.rejects(api.loadAffiliateDirectory('it', 'invalid'), /Evento non disponibile/);
  assert.equal(api.calls.length, 0);
});

test('directory keeps each event separate, zero/disabled affiliates and snapshot-only names while counting people once', async () => {
  const api = fixture({
    events: [event(), event(ids.b, [{ id: ids.affiliate, name: 'Martina altro evento', active: true }])],
    tickets: [legacy('paid'), legacy('used', { status: 'used' }), legacy('pending', { status: 'pending' }), legacy('refund', { status: 'refunded' }), legacy('direct', { affiliate_id: null, affiliate_name: null }), legacy('historic', { affiliate_id: ids.archived, affiliate_name: 'Nome storico', status: 'used' }), legacy('other-event', { event_id: ids.b })],
    passes: [pass('bundle', { commerce_entitlements: [{ status: 'valid' }, { status: 'used' }] }), pass('no-rights', { commerce_entitlements: [{ status: 'refunded' }] }), pass('canceled', { status: 'canceled' }), pass('historic-refunded', { affiliate_id: ids.archived, affiliate_name: 'Nome storico recente', status: 'refunded', created_at: '2026-10-02T10:00:00Z' })],
  });
  const result = await api.loadAffiliateDirectory('en');
  const current = result.rows.find(row => row.eventId === ids.a && row.affiliateId === ids.affiliate);
  assert.deepEqual(plain(current), { eventId: ids.a, eventTitle: 'Meraki Day EN', eventStartsAt: '2026-12-19T11:30:00Z', affiliateId: ids.affiliate, name: 'Martina aggiornata', active: true, archived: false, validCount: 3, checkedInCount: 2, totalCount: 7, commissionPerParticipantCents: 0, commissionCents: 0 });
  assert.equal(result.rows.find(row => row.eventId === ids.b).name, 'Martina altro evento');
  const disabled = result.rows.find(row => row.affiliateId === ids.disabled);
  assert.equal(disabled.validCount, 0); assert.equal(disabled.active, false); assert.equal(disabled.archived, false);
  const historic = result.rows.find(row => row.affiliateId === ids.archived);
  assert.equal(historic.name, 'Nome storico recente'); assert.equal(historic.archived, true); assert.equal(historic.totalCount, 2); assert.equal(historic.validCount, 1);
  assert.equal(result.rows.find(row => row.affiliateId === 'direct').validCount, 1);
  assert.equal(api.calls.some(call => call.table === 'commerce_attendee_contacts'), false);
  for (const call of api.calls) assert.doesNotMatch(call.fields, /email|qr_code|nome|cognome|first_name|last_name|document|phone/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CAPABILITY|purchaser@example|buyer@example/);
});

test('directory event filters are applied to both sources and unknown events never fall back to all participants', async () => {
  const api = fixture({ events: [event(), event(ids.b)], tickets: [legacy('a'), legacy('b', { event_id: ids.b })] });
  const result = await api.loadAffiliateDirectory('it', ids.a);
  assert.equal(result.selectedEventId, ids.a); assert.equal(result.events.length, 2);
  assert.ok(result.rows.every(row => row.eventId === ids.a));
  for (const call of api.calls.filter(call => ['tickets', 'commerce_passes'].includes(call.table))) assert.ok(call.filters.some(([kind, key, value]) => kind === 'eq' && key === 'event_id' && value === ids.a));
  const unknown = fixture();
  await assert.rejects(unknown.loadAffiliateDirectory('it', ids.b), /Evento non disponibile/);
  assert.deepEqual(unknown.calls.map(call => call.table), ['events']);
});

test('stable pagination includes events, legacy tickets and commerce passes beyond the response limit', async () => {
  const events = Array.from({ length: 501 }, (_, index) => event(`10000000-0000-4000-8000-${String(index).padStart(12, '0')}`));
  const tickets = Array.from({ length: 501 }, (_, index) => legacy(`legacy-${String(index).padStart(4, '0')}`, { event_id: events[500].id }));
  const passes = Array.from({ length: 501 }, (_, index) => pass(`commerce-${String(index).padStart(4, '0')}`, { event_id: events[500].id }));
  const api = fixture({ events, tickets, passes });
  const result = await api.loadAffiliateDirectory('it');
  assert.equal(result.events.length, 501);
  assert.equal(result.rows.find(row => row.eventId === events[500].id && row.affiliateId === ids.affiliate).validCount, 1002);
  for (const table of ['events', 'tickets', 'commerce_passes']) {
    const calls = api.calls.filter(call => call.table === table);
    assert.deepEqual(calls.map(call => call.range), [[0, 499], [500, 999]]);
    assert.ok(calls.every(call => call.orders.some(([key]) => key === 'id')));
  }
});

test('affiliate detail scopes both tables, selects the newest participant email and exposes no QR or document data', async () => {
  const api = fixture({
    events: [event(), event(ids.b)],
    tickets: [legacy('legacy-used', { status: 'used' }), legacy('wrong-affiliate', { affiliate_id: ids.disabled }), legacy('wrong-event', { event_id: ids.b })],
    passes: [pass('person', { first_name: 'Bea', commerce_entitlements: [{ activity_id: 'mc', activity_name: 'Masterclass', status: 'used', checked_in_at: '2026-12-19T16:00:00Z', menu_choice: null }] }), pass('fallback', { first_name: 'Carlo' }), pass('canceled', { status: 'canceled' }), pass('refund', { status: 'refunded' }), pass('revoked', { commerce_entitlements: [{ activity_id: 'mc', activity_name: 'Masterclass', status: 'refunded', checked_in_at: null }] }), pass('unrelated', { affiliate_id: ids.disabled })],
    contacts: [{ id: 'old', pass_id: 'person', email: 'old@example.test', created_at: '2026-10-01T10:00:00Z' }, { id: 'new', pass_id: 'person', email: 'participant@example.test', created_at: '2026-10-02T10:00:00Z' }, { id: 'unrelated', pass_id: 'unrelated', email: 'unrelated@example.test', created_at: '2026-10-03T10:00:00Z' }],
  });
  const result = await api.loadAffiliateParticipants('it', ids.a, ids.affiliate);
  assert.equal(result.affiliate.name, 'Martina aggiornata');
  assert.equal(result.totalCount, 6); assert.equal(result.validCount, 3); assert.equal(result.checkedInCount, 2);
  assert.equal(result.participants.find(person => person.id === 'person').email, 'participant@example.test');
  assert.equal(result.participants.find(person => person.id === 'fallback').email, 'purchaser@example.test');
  assert.equal(result.participants.find(person => person.id === 'canceled').status, 'canceled');
  assert.equal(result.participants.find(person => person.id === 'refund').status, 'refunded');
  assert.equal(result.participants.find(person => person.id === 'person').activities[0].name, 'Masterclass');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CAPABILITY|wrong-affiliate|wrong-event|unrelated@example|document|phone|qr_code/);
  for (const call of api.calls.filter(call => ['tickets', 'commerce_passes'].includes(call.table))) {
    assert.deepEqual(call.filters, [['eq', 'event_id', ids.a], ['eq', 'affiliate_id', ids.affiliate]]);
    assert.doesNotMatch(call.fields, /qr_code|document|phone/);
  }
});

test('direct, disabled, archived and empty affiliate details remain explicit without leaking other lists', async () => {
  const api = fixture({ tickets: [legacy('direct', { affiliate_id: null, affiliate_name: null }), legacy('historic', { affiliate_id: ids.archived, affiliate_name: 'Nome storico' })] });
  const direct = await api.loadAffiliateParticipants('it', ids.a, 'direct');
  assert.equal(direct.affiliate.name, 'Acquisti diretti'); assert.deepEqual(plain(direct.participants.map(person => person.id)), ['direct']);
  for (const call of api.calls.filter(call => ['tickets', 'commerce_passes'].includes(call.table))) assert.ok(call.filters.some(([kind, key, value]) => kind === 'is' && key === 'affiliate_id' && value === null));
  const disabled = await api.loadAffiliateParticipants('it', ids.a, ids.disabled);
  assert.equal(disabled.affiliate.active, false); assert.equal(disabled.totalCount, 0);
  const archived = await api.loadAffiliateParticipants('it', ids.a, ids.archived);
  assert.equal(archived.affiliate.archived, true); assert.equal(archived.affiliate.name, 'Nome storico');
  assert.equal(await api.loadAffiliateParticipants('it', ids.b, ids.affiliate), null);
  assert.equal(await fixture().loadAffiliateParticipants('it', ids.a, ids.archived), null);
});

test('detail paginates participants, batches contact IDs and reads the newest email beyond the first contact page', async () => {
  const passes = Array.from({ length: 501 }, (_, index) => pass(`person-${String(index).padStart(4, '0')}`));
  const contacts = Array.from({ length: 501 }, (_, index) => ({ id: `contact-${index}`, pass_id: passes[0].id, email: index === 500 ? 'latest@example.test' : 'older@example.test', created_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() }));
  const api = fixture({ passes, contacts });
  const result = await api.loadAffiliateParticipants('it', ids.a, ids.affiliate);
  assert.equal(result.validCount, 501);
  assert.equal(result.participants.find(person => person.id === passes[0].id).email, 'latest@example.test');
  assert.equal(api.calls.filter(call => call.table === 'commerce_passes').length, 2);
  const contactCalls = api.calls.filter(call => call.table === 'commerce_attendee_contacts');
  assert.equal(contactCalls.length, 7, 'six batches plus the second page of the first batch');
  assert.ok(contactCalls.every(call => call.filters[0][2].length <= 100));
  assert.ok(contactCalls.some(call => call.range[0] === 500));
});

test('query errors never return partial counts or replace failed contact reads with misleading buyer data', async () => {
  for (const table of ['events', 'tickets', 'commerce_passes']) {
    const api = fixture({ fail: call => call.table === table });
    await assert.rejects(api.loadAffiliateDirectory('it'), /Impossibile caricare/);
  }
  const api = fixture({ passes: [pass('person')], fail: call => call.table === 'commerce_attendee_contacts' });
  await assert.rejects(api.loadAffiliateParticipants('it', ids.a, ids.affiliate), /email dei partecipanti/);
  const beyondFirstPage = fixture({ tickets: Array.from({ length: 500 }, (_, index) => legacy(`p${index}`)), fail: call => call.table === 'tickets' && call.range?.[0] === 500 });
  await assert.rejects(beyondFirstPage.loadAffiliateDirectory('it'), /conteggi degli affiliati/);
});

test('unknown legacy states stay unconfirmed and are never presented as paid admissions', async () => {
  const api = fixture({ tickets: [legacy('unknown', { status: null }), legacy('future', { status: 'unknown' })], passes: [pass('unconfirmed', { status: null })] });
  const detail = await api.loadAffiliateParticipants('it', ids.a, ids.affiliate);
  assert.equal(detail.validCount, 0); assert.equal(detail.checkedInCount, 0);
  assert.ok(detail.participants.every(person => person.status === 'pending'));
});

test('private event rates pay each valid participant once, including bundles and group orders', async () => {
  const api = fixture({
    events: [event(), event(ids.b)],
    commissions: [
      { event_id: ids.a, affiliate_id: ids.affiliate, commission_cents: 500 },
      { event_id: ids.b, affiliate_id: ids.affiliate, commission_cents: 700 },
      { event_id: ids.a, affiliate_id: ids.archived, commission_cents: 300 },
      { event_id: ids.a, affiliate_id: 'direct', commission_cents: 900 },
    ],
    tickets: [legacy('legacy'), legacy('other-event', { event_id: ids.b }), legacy('direct', { affiliate_id: null })],
    passes: [
      pass('bundle', { order_id: 'group-order', commerce_entitlements: [{ status: 'valid' }, { status: 'used' }] }),
      pass('same-order-person', { order_id: 'group-order' }),
      pass('refunded', { status: 'refunded' }), pass('pending', { status: 'pending' }),
      pass('revoked', { commerce_entitlements: [{ status: 'refunded' }] }),
      pass('archived', { affiliate_id: ids.archived }),
    ],
  });
  const directory = await api.loadAffiliateDirectory('it');
  const row = directory.rows.find(row => row.eventId === ids.a && row.affiliateId === ids.affiliate);
  assert.equal(row.validCount, 3); assert.equal(row.totalCount, 6);
  assert.equal(row.commissionPerParticipantCents, 500); assert.equal(row.commissionCents, 1500);
  assert.equal(directory.rows.find(row => row.eventId === ids.b && row.affiliateId === ids.affiliate).commissionCents, 700);
  assert.equal(directory.rows.find(row => row.affiliateId === ids.archived).commissionCents, 300);
  assert.equal(directory.rows.find(row => row.affiliateId === ids.disabled).commissionCents, 0);
  assert.equal(directory.rows.find(row => row.affiliateId === 'direct').commissionPerParticipantCents, 0);
  assert.equal(directory.rows.find(row => row.affiliateId === 'direct').commissionCents, 0);
  const detail = await api.loadAffiliateParticipants('it', ids.a, ids.affiliate);
  assert.equal(detail.affiliate.commissionPerParticipantCents, 500); assert.equal(detail.affiliate.commissionCents, 1500);
  const detailRead = api.calls.filter(call => call.table === 'event_affiliate_commissions').at(-1);
  assert.deepEqual(plain(detailRead.filters), [['in', 'event_id', [ids.a]], ['eq', 'affiliate_id', ids.affiliate]]);
  const scoped = await api.loadAffiliateDirectory('it', ids.a);
  assert.equal(scoped.rows.find(row => row.affiliateId === ids.affiliate).commissionCents, 1500);
  const scopedRead = api.calls.filter(call => call.table === 'event_affiliate_commissions').at(-1);
  assert.deepEqual(plain(scopedRead.filters), [['in', 'event_id', [ids.a]]]);
});

test('commission query failures and invalid stored rates cannot become a reassuring zero', async () => {
  const failed = fixture({ fail: call => call.table === 'event_affiliate_commissions' });
  await assert.rejects(failed.loadAffiliateDirectory('it'), /compensi degli affiliati/);
  await assert.rejects(failed.loadAffiliateParticipants('it', ids.a, ids.affiliate), /compensi degli affiliati/);
  for (const commission_cents of [-1, 1.5, null]) {
    const api = fixture({ commissions: [{ event_id: ids.a, affiliate_id: ids.affiliate, commission_cents }] });
    await assert.rejects(api.loadAffiliateDirectory('it'), /Compenso dell’affiliato non valido/);
    await assert.rejects(api.loadAffiliateParticipants('it', ids.a, ids.affiliate), /Compenso dell’affiliato non valido/);
  }
  const direct = fixture({ tickets: [legacy('direct', { affiliate_id: null })], fail: call => call.table === 'event_affiliate_commissions' });
  const detail = await direct.loadAffiliateParticipants('it', ids.a, 'direct');
  assert.equal(detail.affiliate.commissionCents, 0);
  assert.equal(direct.calls.some(call => call.table === 'event_affiliate_commissions'), false);
});

test('a canceled event stops valid counts, check-ins and compensation before legacy refunds settle', async () => {
  const api = fixture({
    events: [{ ...event(), canceled_at: '2026-10-26T10:00:00Z' }, event(ids.b)],
    tickets: [legacy('awaiting-refund'), legacy('used-awaiting-refund', { status: 'used' }), legacy('other-event', { event_id: ids.b, status: 'used' })],
    passes: [pass('canceled-commerce', { status: 'canceled', commerce_entitlements: [{ status: 'canceled' }] })],
    commissions: [
      { event_id: ids.a, affiliate_id: ids.affiliate, commission_cents: 500 },
      { event_id: ids.b, affiliate_id: ids.affiliate, commission_cents: 500 },
    ],
  });
  const directory = await api.loadAffiliateDirectory('it');
  const canceled = directory.rows.find(row => row.eventId === ids.a && row.affiliateId === ids.affiliate);
  assert.equal(canceled.totalCount, 3); assert.equal(canceled.validCount, 0); assert.equal(canceled.checkedInCount, 0);
  assert.equal(canceled.commissionPerParticipantCents, 500); assert.equal(canceled.commissionCents, 0);
  const active = directory.rows.find(row => row.eventId === ids.b && row.affiliateId === ids.affiliate);
  assert.equal(active.validCount, 1); assert.equal(active.checkedInCount, 1); assert.equal(active.commissionCents, 500);
  const detail = await api.loadAffiliateParticipants('it', ids.a, ids.affiliate);
  assert.equal(detail.totalCount, 3); assert.equal(detail.validCount, 0); assert.equal(detail.checkedInCount, 0);
  assert.equal(detail.affiliate.commissionPerParticipantCents, 500); assert.equal(detail.affiliate.commissionCents, 0);
  assert.equal(detail.participants.find(row => row.id === 'awaiting-refund').status, 'paid');
  assert.equal(detail.participants.find(row => row.id === 'used-awaiting-refund').status, 'used');
  assert.ok(detail.participants.every(row => !row.checkedIn));
  assert.ok(api.calls.filter(call => call.table === 'events').every(call => call.fields.includes('canceled_at')));
});
