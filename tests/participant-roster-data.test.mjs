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
  const loaded = { exports: {} };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: name => name in mocks ? mocks[name] : require(name), Map, Set, Date });
  return loaded.exports;
}
const ids = {
  event: '10000000-0000-4000-8000-000000000001', otherEvent: '10000000-0000-4000-8000-000000000002',
  affiliate: '20000000-0000-4000-8000-000000000001', otherAffiliate: '20000000-0000-4000-8000-000000000002', historical: '20000000-0000-4000-8000-000000000003', unknown: '20000000-0000-4000-8000-000000000004',
  participant: '30000000-0000-4000-8000-000000000001', otherParticipant: '30000000-0000-4000-8000-000000000002',
};
const event = (overrides = {}) => ({ id: ids.event, titolo: { it: 'Evento Meraki', en: 'Meraki Event' }, data_inizio: '2026-12-19T11:00:00Z', canceled_at: null, affiliates: [{ id: ids.affiliate, name: 'Affiliato aggiornato', active: true }], commerce_config: { activities: [{ id: 'ws', kind: 'workshop' }, { id: 'mc', kind: 'masterclass' }, { id: 'dinner', kind: 'dinner' }] }, ...overrides });
const person = (overrides = {}) => ({ firstName: 'Ada', lastName: 'Rossi', email: 'attendee@example.test', phone: '+390123456789', documentType: 'codice_fiscale', documentCountry: 'IT', documentNumber: 'RSSMRA80A01H501U', marketingConsent: false, ...overrides });
const order = (id = 'o1', overrides = {}) => ({ id, event_id: ids.event, buyer_email: 'buyer@example.test', created_at: '2026-10-01T10:00:00Z', attendees: [person()], attendee_privacy_version: 'privacy-v1', stripe_payment_intent: 'PRIVATE-PAYMENT-CAPABILITY', ...overrides });
const pass = (id = 'p1', overrides = {}) => ({ id, event_id: ids.event, order_id: 'o1', participant_index: 0, first_name: 'Ada', last_name: 'Rossi', package_name: 'Workshop + Masterclass', package_activity_ids: ['ws', 'mc'], status: 'paid', created_at: '2026-10-01T10:01:00Z', affiliate_id: ids.affiliate, affiliate_name: 'Nome precedente', qr_code: 'PRIVATE-QR-CAPABILITY', commerce_entitlements: [{ activity_id: 'ws', activity_name: 'Workshop', kind: 'workshop', status: 'valid', checked_in_at: null, menu_choice: null }, { activity_id: 'mc', activity_name: 'Masterclass', kind: 'masterclass', status: 'valid', checked_in_at: null, menu_choice: null }], ...overrides });
const contact = (overrides = {}) => ({ id: 'c1', pass_id: 'p1', order_id: 'o1', participant_index: 0, first_name: 'Ada', last_name: 'Rossi', email: 'contact@example.test', phone: '+390987654321', document_type: 'codice_fiscale', document_country: 'IT', document_number: 'RSSMRA80A01H501U', privacy_version: 'privacy-contact-v1', created_at: '2026-10-01T10:02:00Z', ...overrides });
const ticket = (id = 't1', overrides = {}) => ({ id, event_id: ids.event, buyer_nome: 'Lina', buyer_cognome: 'Bianchi', buyer_email: 'legacy-buyer@example.test', buyer_telefono: '+390111222333', status: 'paid', used_at: null, created_at: '2026-09-30T10:00:00Z', affiliate_id: ids.affiliate, affiliate_name: 'Nome precedente', qr_code: 'PRIVATE-LEGACY-QR', ...overrides });

function fixture({ events = [event()], passes = [], tickets = [], commerceContacts = [], legacyContacts = [], orders = [], reservations = [], denied = false, fail } = {}) {
  const calls = [];
  let authenticated = false;
  const tables = { events, commerce_passes: passes, tickets, commerce_attendee_contacts: commerceContacts, legacy_ticket_attendee_contacts: legacyContacts, commerce_orders: orders, ticket_reservations: reservations };
  const db = { from(table) {
    assert.equal(authenticated, true, 'every private read follows staff authorization');
    const call = { table, fields: '', filters: [], orders: [], range: null }; calls.push(call);
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
      if (fail?.(call)) return { data: null, error: { message: 'Synthetic query failure' } };
      let rows = (tables[table] || []).filter(row => call.filters.every(([kind, key, value]) => kind === 'in' ? value.includes(row[key]) : row[key] === value));
      rows = [...rows].sort((a, b) => { for (const [key, ascending] of call.orders) { const compared = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (compared) return ascending ? compared : -compared; } return 0; });
      return { data: single ? rows[0] || null : rows.slice(call.range[0], call.range[1] + 1), error: null };
    }
    return query;
  } };
  const api = compile('lib/admin/participant-roster.ts', {
    'server-only': {}, '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => { if (denied) throw new Error('Not staff'); authenticated = true; return db; } },
    '@/lib/i18n-utils': compile('lib/i18n-utils.ts'), '@/lib/events/affiliates': compile('lib/events/affiliates.ts'),
  });
  return { ...api, calls };
}

test('staff authorization precedes validation and every private query; malformed or missing scopes never broaden the roster', async () => {
  const denied = fixture({ denied: true });
  await assert.rejects(denied.loadParticipantRoster({ locale: 'it', eventId: 'invalid' }), error => error.status === 403);
  assert.equal(denied.calls.length, 0);
  for (const input of [{ eventId: '' }, { eventId: 'invalid' }, { eventId: ids.event, affiliateId: 'invalid' }]) {
    const api = fixture();
    await assert.rejects(api.loadParticipantRoster({ locale: 'it', ...input }), error => error.status === 400);
    assert.equal(api.calls.length, 0);
  }
  const missing = fixture({ events: [] });
  await assert.rejects(missing.loadParticipantRoster({ locale: 'it', eventId: ids.event }), error => error.status === 404);
  assert.equal(missing.calls.length, 1);
});

test('the event chooser verifies staff, pages all labels and reads no participant, contact or compensation data', async () => {
  const denied = fixture({ denied: true });
  await assert.rejects(denied.loadParticipantRosterEvents('it'), error => error.status === 403);
  assert.equal(denied.calls.length, 0);
  const api = fixture({ events: Array.from({ length: 501 }, (_, index) => event({ id: `event-${String(index).padStart(4, '0')}` })) });
  const result = await api.loadParticipantRosterEvents('en');
  assert.equal(result.length, 501);
  assert.deepEqual(plain(result[0]), { id: 'event-0000', title: 'Meraki Event', startsAt: '2026-12-19T11:00:00Z' });
  assert.deepEqual(api.calls.map(call => call.range), [[0, 499], [500, 999]]);
  assert.ok(api.calls.every(call => call.table === 'events' && call.fields === 'id,titolo,data_inizio'));
  const unavailable = fixture({ events: Array.from({ length: 501 }, (_, index) => event({ id: `event-${index}` })), fail: call => call.range?.[0] === 500 });
  await assert.rejects(unavailable.loadParticipantRosterEvents('it'), error => error.status === 503);
});

test('latest contact data uses its exact order/index for consent, preserves current pass identity and masks documents by default', async () => {
  const api = fixture({
    passes: [pass('p1', { participant_index: 1 })],
    orders: [order('o1', { attendees: [person({ email: 'unrelated@example.test', marketingConsent: true }), person({ marketingConsent: false })] }), order('upgrade', { created_at: '2026-10-02T10:00:00Z', attendees: [person({ marketingConsent: true })], attendee_privacy_version: 'privacy-v2' })],
    commerceContacts: [contact(), contact({ id: 'new', order_id: 'upgrade', email: 'latest@example.test', phone: '+390222333444', first_name: 'Untrusted old name', created_at: '2026-10-02T10:01:00Z', privacy_version: 'privacy-contact-v2' })],
  });
  const result = await api.loadParticipantRoster({ locale: 'en', eventId: ids.event, affiliateId: ids.affiliate });
  assert.equal(result.event.title, 'Meraki Event');
  assert.deepEqual(plain(result.affiliate), { id: ids.affiliate, name: 'Affiliato aggiornato' });
  assert.equal(result.participants.length, 1);
  const row = result.participants[0];
  assert.deepEqual([row.firstName, row.lastName, row.email, row.phone, row.buyerEmail], ['Ada', 'Rossi', 'latest@example.test', '+390222333444', 'buyer@example.test']);
  assert.equal(row.marketingConsent, true); assert.equal(row.privacyVersion, 'privacy-contact-v2');
  assert.equal(row.createdAt, '2026-10-01T10:00:00Z'); assert.equal(row.contactCreatedAt, '2026-10-02T10:01:00Z'); assert.equal(row.contactAvailable, true);
  assert.equal(row.documentNumber, ''); assert.equal(row.maskedDocument, '••••••••••••501U');
  assert.equal(row.affiliateName, 'Affiliato aggiornato'); assert.equal(row.packageName, 'Workshop + Masterclass');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-QR|PRIVATE-PAYMENT|RSSMRA80A01H501U|unrelated@example/);
  assert.ok(api.calls.every(call => !/qr_code|stripe_|payment_intent|token/.test(call.fields)));
  const full = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, includeDocuments: true });
  assert.equal(full.participants[0].documentNumber, 'RSSMRA80A01H501U');
  const stringFlag = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, includeDocuments: 'true' });
  assert.equal(stringFlag.participants[0].documentNumber, '');
});

test('event and current-affiliate filters scope both ticket sources, contacts and matching orders without leaking another event', async () => {
  const api = fixture({
    events: [event(), event({ id: ids.otherEvent })],
    passes: [pass('current'), pass('direct', { affiliate_id: null, affiliate_name: null }), pass('historical', { affiliate_id: ids.historical, affiliate_name: 'Affiliato storico' }), pass('other-event', { event_id: ids.otherEvent })],
    tickets: [ticket('legacy-direct', { affiliate_id: null, affiliate_name: null }), ticket('other-affiliate', { affiliate_id: ids.otherAffiliate }), ticket('legacy-other-event', { event_id: ids.otherEvent })],
    orders: [order()], commerceContacts: [contact({ pass_id: 'other-event', email: 'PRIVATE-OTHER-EVENT@example.test' })],
  });
  const all = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, affiliateId: 'all' });
  assert.equal(all.participants.length, 5); assert.equal(all.affiliate, null);
  assert.doesNotMatch(JSON.stringify(all), /other-event|PRIVATE-OTHER-EVENT/);
  const direct = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, affiliateId: 'direct' });
  assert.deepEqual(plain(direct.participants.map(row => row.id).sort()), ['direct', 'legacy-direct']);
  assert.ok(direct.participants.every(row => row.affiliateId === null && row.affiliateName === 'Acquisti diretti'));
  const current = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, affiliateId: ids.affiliate });
  assert.deepEqual(plain(current.participants.map(row => row.id)), ['current']);
  const historical = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, affiliateId: ids.historical });
  assert.equal(historical.affiliate.name, 'Affiliato storico'); assert.equal(historical.participants.length, 1);
  await assert.rejects(api.loadParticipantRoster({ locale: 'it', eventId: ids.event, affiliateId: ids.unknown }), error => error.status === 404);
  for (const call of api.calls.filter(call => ['commerce_passes', 'tickets', 'commerce_orders', 'ticket_reservations'].includes(call.table))) assert.ok(call.filters.some(([kind, key, value]) => kind === 'eq' && key === 'event_id' && value === ids.event));
  assert.ok(api.calls.filter(call => call.table === 'commerce_passes').some(call => call.filters.some(([kind, key]) => kind === 'is' && key === 'affiliate_id')));
});

test('the roster keeps refunded and canceled people, consolidates upgrades and exposes current activities, dinner choices and check-ins', async () => {
  const api = fixture({
    passes: [pass('active', { commerce_entitlements: [
      { activity_id: 'ws', activity_name: 'Workshop', status: 'valid', checked_in_at: null, menu_choice: null },
      { activity_id: 'mc', activity_name: 'Masterclass', kind: 'masterclass', status: 'refunded', checked_in_at: null, menu_choice: null },
      { activity_id: 'dinner', activity_name: 'Cena', status: 'used', checked_in_at: '2026-12-19T18:00:00Z', menu_choice: 'Vegetariano' },
    ] }), pass('refunded', { status: 'refunded' }), pass('canceled', { status: 'canceled' })],
    orders: [order(), order('upgrade-one'), order('upgrade-two')],
  });
  const result = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event });
  assert.equal(result.participants.length, 3);
  const row = result.participants.find(row => row.id === 'active');
  assert.equal(row.valid, true); assert.equal(row.checkedIn, true); assert.equal(row.checkedInAt, '2026-12-19T18:00:00Z');
  assert.equal(row.packageName, 'Accessi parziali: Workshop');
  assert.equal(row.activities.find(entry => entry.id === 'dinner').kind, 'dinner');
  assert.equal(row.activities.find(entry => entry.id === 'dinner').menuChoice, 'Vegetariano');
  assert.equal(row.activities.find(entry => entry.id === 'mc').status, 'refunded');
  assert.deepEqual(plain(result.participants.filter(row => row.id !== 'active').map(row => [row.status, row.valid, row.checkedIn])), [['canceled', false, false], ['refunded', false, false]]);
});

test('legacy contacts keep actual registration fields, foreign documents, signup choice and historical check-in date', async () => {
  const api = fixture({
    tickets: [ticket('t1', { status: 'used', used_at: '2026-12-19T10:00:00Z' })],
    legacyContacts: [{ ...contact({ first_name: 'Lina', last_name: 'Bianchi', email: 'legacy-recipient@example.test', document_type: 'foreign_id', document_country: 'DE', document_number: 'ABCD12345' }), ticket_id: 't1', reservation_id: 'r1' }],
    reservations: [{ id: 'r1', event_id: ids.event, created_at: '2026-09-29T10:00:00Z', attendee: person({ marketingConsent: false }), attendee_privacy_version: 'legacy-privacy' }],
  });
  const row = (await api.loadParticipantRoster({ locale: 'it', eventId: ids.event, includeDocuments: true })).participants[0];
  assert.deepEqual([row.source, row.firstName, row.lastName, row.email, row.buyerEmail], ['legacy', 'Lina', 'Bianchi', 'legacy-recipient@example.test', 'legacy-buyer@example.test']);
  assert.deepEqual([row.documentType, row.documentCountry, row.documentNumber], ['foreign_id', 'DE', 'ABCD12345']);
  assert.equal(row.marketingConsent, false); assert.equal(row.status, 'used'); assert.equal(row.checkedInAt, '2026-12-19T10:00:00Z');
  assert.equal(row.createdAt, '2026-09-29T10:00:00Z'); assert.equal(row.valid, true);
});

test('missing contacts use only a reliable explicit participant index and never confuse buyer email with attendee email', async () => {
  const api = fixture({
    passes: [pass('indexed'), pass('unindexed', { participant_index: null })],
    tickets: [ticket('old')], orders: [order('o1', { attendees: [person({ email: 'indexed@example.test' }), person({ email: 'another-person@example.test' })] })],
  });
  const result = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event });
  const indexed = result.participants.find(row => row.id === 'indexed');
  assert.equal(indexed.email, 'indexed@example.test'); assert.equal(indexed.contactAvailable, true); assert.equal(indexed.contactCreatedAt, null); assert.equal(indexed.marketingConsent, false);
  const unindexed = result.participants.find(row => row.id === 'unindexed');
  assert.deepEqual([unindexed.email, unindexed.documentNumber, unindexed.maskedDocument, unindexed.contactAvailable, unindexed.marketingConsent], ['', '', '', false, null]);
  const old = result.participants.find(row => row.id === 'old');
  assert.equal(old.email, ''); assert.equal(old.buyerEmail, 'legacy-buyer@example.test'); assert.equal(old.phone, '+390111222333'); assert.equal(old.contactAvailable, false);
});

test('all pages and contact batches are included and deterministic contact ties use a stable id order', async () => {
  const passes = Array.from({ length: 501 }, (_, index) => pass(`p-${String(index).padStart(4, '0')}`, { order_id: `o-${index}` }));
  const api = fixture({ passes, commerceContacts: [contact({ id: 'z', pass_id: 'p-0000', email: 'later-tie@example.test' }), contact({ id: 'a', pass_id: 'p-0000', email: 'stable-first@example.test' })] });
  const result = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event });
  assert.equal(result.participants.length, 501);
  assert.equal(result.participants.find(row => row.id === 'p-0000').email, 'stable-first@example.test');
  assert.deepEqual(api.calls.filter(call => call.table === 'commerce_passes').map(call => call.range), [[0, 499], [500, 999]]);
  const contacts = api.calls.filter(call => call.table === 'commerce_attendee_contacts');
  assert.equal(contacts.length, 6);
  assert.ok(contacts.every(call => call.filters.find(([kind]) => kind === 'in')[2].length <= 100));
  assert.ok(contacts.every(call => JSON.stringify(call.orders) === JSON.stringify([['created_at', false], ['id', true]])));
});

test('private-data read failures fail the complete roster explicitly and canceled events cannot report valid admissions', async () => {
  for (const failedTable of ['events', 'commerce_passes', 'tickets', 'commerce_attendee_contacts', 'legacy_ticket_attendee_contacts', 'commerce_orders', 'ticket_reservations']) {
    const api = fixture({ passes: [pass()], tickets: [ticket()], commerceContacts: [contact()], legacyContacts: [{ ...contact(), ticket_id: 't1', reservation_id: 'r1' }], orders: [order()], fail: call => call.table === failedTable });
    await assert.rejects(api.loadParticipantRoster({ locale: 'it', eventId: ids.event }), error => error.status === 503, failedTable);
  }
  const canceled = fixture({ events: [event({ canceled_at: '2026-11-01T10:00:00Z' })], passes: [pass()], tickets: [ticket('used', { status: 'used', used_at: '2026-10-30T10:00:00Z' })] });
  const result = await canceled.loadParticipantRoster({ locale: 'it', eventId: ids.event });
  assert.equal(result.event.canceled, true);
  assert.ok(result.participants.every(row => !row.valid && !row.checkedIn));
  assert.equal(result.participants.find(row => row.id === 'used').checkedInAt, '2026-10-30T10:00:00Z');
  const refunded = fixture({ tickets: [ticket('refunded', { status: 'refunded', used_at: '2026-10-29T10:00:00Z' })] });
  const history = (await refunded.loadParticipantRoster({ locale: 'it', eventId: ids.event })).participants[0];
  assert.deepEqual([history.status, history.valid, history.checkedIn, history.checkedInAt], ['refunded', false, false, '2026-10-29T10:00:00Z']);
});

test('commerce details query only the requested event/person/source and reveal documents only in that explicit detail', async () => {
  const api = fixture({
    passes: [pass(ids.participant), pass(ids.otherParticipant, { participant_index: 1, first_name: 'Altra', last_name: 'Persona' })],
    tickets: [ticket(ids.participant)],
    orders: [order('o1', { attendees: [person(), person({ email: 'PRIVATE-OTHER-PERSON@example.test', documentNumber: 'PRIVATE-OTHER-DOCUMENT' })] })],
    commerceContacts: [contact({ pass_id: ids.participant }), contact({ id: 'other-contact', pass_id: ids.otherParticipant, participant_index: 1, email: 'PRIVATE-OTHER-CONTACT@example.test', document_number: 'PRIVATE-OTHER-DOCUMENT' })],
  });
  const result = await api.loadParticipantDetails({ locale: 'it', eventId: ids.event, participantId: ids.participant, source: 'commerce' });
  assert.deepEqual(Object.keys(result).sort(), ['event', 'participant']);
  assert.equal(result.participant.id, ids.participant); assert.equal(result.participant.source, 'commerce');
  assert.equal(result.participant.documentNumber, 'RSSMRA80A01H501U'); assert.equal(result.participant.email, 'contact@example.test');
  assert.equal(result.participant.marketingConsent, false); assert.equal(result.participant.packageName, 'Workshop + Masterclass');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-OTHER|PRIVATE-QR|PRIVATE-PAYMENT/);
  const passReads = api.calls.filter(call => call.table === 'commerce_passes');
  assert.ok(passReads.every(call => call.filters.some(([kind, key, value]) => kind === 'eq' && key === 'id' && value === ids.participant)));
  assert.ok(passReads.every(call => call.filters.some(([kind, key, value]) => kind === 'eq' && key === 'event_id' && value === ids.event)));
  assert.equal(api.calls.some(call => call.table === 'tickets' || call.table === 'legacy_ticket_attendee_contacts'), false);
  assert.ok(api.calls.filter(call => call.table === 'commerce_attendee_contacts').every(call => JSON.stringify(call.filters.find(([kind]) => kind === 'in')[2]) === JSON.stringify([ids.participant])));
  const ordinary = await api.loadParticipantRoster({ locale: 'it', eventId: ids.event });
  assert.ok(ordinary.participants.every(row => row.documentNumber === ''));
});

test('legacy details keep refunded history and foreign registration documents without reading commerce participants', async () => {
  const api = fixture({
    tickets: [ticket(ids.participant, { status: 'refunded', used_at: '2026-10-29T10:00:00Z' }), ticket(ids.otherParticipant)],
    legacyContacts: [{ ...contact({ document_type: 'foreign_id', document_country: 'DE', document_number: 'DE12345678' }), ticket_id: ids.participant, reservation_id: 'r1' }],
    reservations: [{ id: 'r1', event_id: ids.event, attendee: person({ marketingConsent: true }), attendee_privacy_version: 'privacy-v1', created_at: '2026-09-29T10:00:00Z' }],
  });
  const result = await api.loadParticipantDetails({ locale: 'en', eventId: ids.event, participantId: ids.participant, source: 'legacy' });
  assert.equal(result.event.title, 'Meraki Event');
  assert.deepEqual([result.participant.id, result.participant.source, result.participant.status, result.participant.valid], [ids.participant, 'legacy', 'refunded', false]);
  assert.deepEqual([result.participant.documentType, result.participant.documentCountry, result.participant.documentNumber], ['foreign_id', 'DE', 'DE12345678']);
  assert.equal(result.participant.checkedInAt, '2026-10-29T10:00:00Z'); assert.equal(result.participant.marketingConsent, true);
  assert.equal(api.calls.some(call => ['commerce_passes', 'commerce_attendee_contacts', 'commerce_orders'].includes(call.table)), false);
  assert.ok(api.calls.filter(call => call.table === 'tickets').every(call => call.filters.some(([kind, key, value]) => kind === 'eq' && key === 'id' && value === ids.participant)));
});

test('detail identifiers, source and locale validate after staff auth and absent participants never fall back to an event list', async () => {
  const input = { locale: 'it', eventId: ids.event, participantId: ids.participant, source: 'commerce' };
  const denied = fixture({ denied: true });
  await assert.rejects(denied.loadParticipantDetails({ ...input, eventId: 'invalid', participantId: '' }), error => error.status === 403);
  assert.equal(denied.calls.length, 0);
  for (const extra of [{ eventId: 'invalid' }, { participantId: '' }, { participantId: 'invalid' }, { participantId: undefined, source: undefined }, { source: '' }, { source: 'both' }, { locale: 'fr' }]) {
    const api = fixture();
    await assert.rejects(api.loadParticipantDetails({ ...input, ...extra }), error => error.status === 400);
    assert.equal(api.calls.length, 0);
  }
  const absent = fixture({ passes: [pass(ids.otherParticipant)], tickets: [ticket(ids.participant)] });
  await assert.rejects(absent.loadParticipantDetails(input), error => error.status === 404);
  assert.equal(absent.calls.some(call => /contacts|orders|reservations/.test(call.table)), false);
  assert.equal(absent.calls.some(call => call.table === 'tickets'), false);
  const wrongEvent = fixture({ events: [event(), event({ id: ids.otherEvent })], passes: [pass(ids.participant, { event_id: ids.otherEvent })] });
  await assert.rejects(wrongEvent.loadParticipantDetails(input), error => error.status === 404);
  for (const locale of ['it', 'en', 'de', 'es']) {
    const api = fixture({ passes: [pass(ids.participant)] });
    assert.equal((await api.loadParticipantDetails({ ...input, locale })).participant.id, ids.participant);
  }
});

test('historical details expose missing contact data explicitly and fail closed on private read errors', async () => {
  const input = { locale: 'it', eventId: ids.event, participantId: ids.participant, source: 'legacy' };
  const api = fixture({ tickets: [ticket(ids.participant)] });
  const result = await api.loadParticipantDetails(input);
  assert.deepEqual([result.participant.contactAvailable, result.participant.email, result.participant.documentNumber, result.participant.marketingConsent], [false, '', '', null]);
  assert.equal(result.participant.buyerEmail, 'legacy-buyer@example.test');
  const failed = fixture({ tickets: [ticket(ids.participant)], fail: call => call.table === 'legacy_ticket_attendee_contacts' });
  await assert.rejects(failed.loadParticipantDetails(input), error => error.status === 503);
});
