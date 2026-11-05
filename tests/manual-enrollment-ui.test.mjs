import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import test, { after } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { nativeFormControlMocks } from './helpers/native-form-controls.mjs';
import { nominalTicketModules } from './helpers/nominal-ticket-modules.mjs';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://meraki.test/it/admin/biglietti/nuovo', pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');
after(() => { dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function compile(path, overrides = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => overrides[name] || nativeFormControlMocks[name] || nominalTicketModules[name] || require(name), URLSearchParams, AbortController, crypto: { randomUUID }, setTimeout, clearTimeout, console, ...overrides.globals });
  return module.exports;
}
const phone = compile('lib/commerce/phone-country.ts');
const copy = compile('components/meraki/checkout-copy.ts');
const attendee = compile('lib/commerce/attendee.ts');
const contacts = compile('components/meraki/checkout-contact-fields.tsx', { './checkout-copy': copy, '@/lib/commerce/phone-country': phone, './commerce-purchase.module.css': { default: new Proxy({}, { get: (_, key) => key }) } });
const time = compile('lib/commerce/rome-time.ts');
const eventId = '30da43c2-3ee7-4e7d-97b4-28c789e366de';
const passId = '638341ca-0e99-454d-80ff-55bfa038785c';
const orderId = '2e477cdf-0076-4409-822a-d329b148c066';
const context = {
  event: { id: eventId, title: 'Evento di prova', startsAt: '2030-12-19T18:00:00Z' }, affiliates: [{ id: 'affiliate', name: 'Affiliato test' }],
  config: { enabled: true, upgradesEnabled: true, activities: [{ id: 'w', name: 'Workshop', menuOptions: [], kind: 'workshop' }, { id: 'm', name: 'Masterclass', menuOptions: [], kind: 'masterclass' }, { id: 'd', name: 'Cena', kind: 'dinner', menuOptions: ['Pizza', 'Vegetariano'] }], packages: [{ id: 'solo', name: 'Workshop', activityIds: ['w'], prices: [] }, { id: 'both', name: 'Workshop + Masterclass', activityIds: ['w', 'm'], prices: [] }], addons: [{ id: 'dinner', name: 'Cena', activityId: 'd', amountCents: 2000 }] },
};
function response(data, status = 200) { return { ok: status < 400, status, async json() { return data; } }; }
async function setup(t, { upgrade = false, send, quoteHook, emailStatus = 'sent' } = {}) {
  const calls = [];
  const actualContext = structuredClone(context);
  if (upgrade) actualContext.upgrade = { id: passId, firstName: 'Ada', lastName: 'Rossi', buyerEmail: 'ada@example.test', packageId: 'solo', packageActivityIds: ['w'], packagePaidCents: 3000, ownedActivityIds: ['w', 'd'], menuChoices: { d: 'Pizza' } };
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body });
    if (url.includes('/context?')) return response(actualContext);
    if (url.endsWith('/quote')) {
      if (quoteHook) return quoteHook(body);
      const lines = body.participants.map((person, participantIndex) => ({ label: person.packageId === 'both' ? 'Workshop + Masterclass' : 'Workshop', totalCents: upgrade ? person.packageId === 'both' ? 2000 : 0 : person.packageId === 'both' ? 5000 : 3000, participantIndex, kind: upgrade ? 'upgrade' : 'package', activityIds: ['w'] }));
      for (const [participantIndex, person] of body.participants.entries()) if (person.addonIds.includes('dinner')) lines.push({ label: 'Cena', totalCents: 2000, participantIndex, kind: 'addon', activityIds: ['d'] });
      return response({ quote: { lines, participants: body.participants, totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0) } });
    }
    if (url.endsWith('/email')) return response({ emailStatus: 'sent' });
    return send ? send(body, calls) : response({ orderId, passIds: Array.from({ length: body.participants.length }, (_, i) => `${passId}-${i}`), replayed: false, emailStatus });
  };
  const { ManualEnrollmentClient } = compile('components/admin/manual-enrollment-client.tsx', {
    '@/i18n/routing': { Link: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/meraki/checkout-contact-fields': contacts, '@/components/meraki/checkout-copy': copy,
    '@/lib/commerce/attendee': attendee, '@/lib/commerce/rome-time': time,
    './date-time-field': nativeFormControlMocks['@/components/admin/date-time-field'], './euro-input': nativeFormControlMocks['@/components/admin/euro-input'], globals: { fetch },
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(ManualEnrollmentClient, { eventId, locale: 'it', ...(upgrade ? { upgradePassId: passId } : {}) })));
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  await settle();
  const change = async (selector, value) => {
    const node = host.querySelector(selector);
    assert.ok(node, selector);
    const prototype = node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
      node.dispatchEvent(new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };
  const click = async node => act(async () => node.click());
  const submit = async () => act(async () => host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  const fill = async (index = 0, foreign = false) => {
    await change(`#manual-${index}-firstName`, index ? 'Edo' : 'Ada');
    await change(`#manual-${index}-lastName`, index ? 'Bianchi' : 'Rossi');
    await change(`#manual-${index}-email`, `${index ? 'edo' : 'ada'}@example.test`);
    await change(`#manual-${index}-phone`, '+393331234567');
    if (foreign) { await change(`#manual-${index}-document-type`, 'foreign_id'); await change(`#manual-${index}-document-country`, 'DE'); }
    await change(`#manual-${index}-document-number`, foreign ? 'ABC123456' : 'RSSMRA80A01H501U');
  };
  const confirm = () => host.querySelector('#manual-summary').parentElement.querySelector('input[type=checkbox]');
  return { host, calls, change, click, submit, fill, settle, confirm };
}

test('cash group issues one pass per person, with separate documents, dinner, affiliate and no marketing grant', async t => {
  const ui = await setup(t);
  await ui.change('[aria-label="Numero di partecipanti"]', '2');
  await ui.fill(0); await ui.fill(1, true);
  const dinner = [...ui.host.querySelectorAll('label')].find(label => label.textContent.includes('Cena ·'))?.querySelector('input');
  await ui.click(dinner);
  await ui.change('[aria-label="Menù Cena partecipante 1"]', 'Pizza');
  const affiliate = [...ui.host.querySelectorAll('select')].find(select => select.textContent.includes('Affiliato test'));
  await act(async () => { affiliate.value = 'affiliate'; affiliate.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await ui.settle(); await ui.click(ui.confirm()); await ui.submit();
  const body = ui.calls.find(call => call.url === '/api/admin/manual-enrollments')?.body;
  assert.ok(body); assert.equal(body.paymentMethod, 'cash'); assert.equal(body.feeCents, 0);
  assert.equal(body.expectedTotalCents, 8000); assert.equal(body.participants.length, 2);
  assert.equal(body.attendees[0].documentType, 'codice_fiscale'); assert.equal(body.attendees[1].documentType, 'foreign_id');
  assert.equal(body.attendees.every(person => person.marketingConsent === false), true);
  assert.equal(body.affiliateId, 'affiliate'); assert.equal(body.confirm, true);
  assert.equal(body.participants[0].menuChoices.d, 'Pizza');
  assert.match(ui.host.textContent, /2 biglietti nominali creati/);
  assert.equal(ui.calls.filter(call => call.url.endsWith('/quote')).every(call => !JSON.stringify(call.body).includes('ABC123456')), true);
});

test('POS unknown fee stays null; email failure offers delivery retry without another enrollment', async t => {
  const ui = await setup(t, { emailStatus: 'pending' });
  await ui.fill();
  const method = [...ui.host.querySelectorAll('select')].find(select => select.textContent.includes('POS / bancomat'));
  await act(async () => { method.value = 'pos'; method.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await ui.click(ui.confirm()); await ui.submit();
  const body = ui.calls.find(call => call.url === '/api/admin/manual-enrollments').body;
  assert.equal(body.feeCents, null); assert.equal(body.paymentMethod, 'pos');
  await ui.click([...ui.host.querySelectorAll('button')].find(button => button.textContent === 'Riprova invio email'));
  assert.equal(ui.calls.filter(call => call.url === '/api/admin/manual-enrollments').length, 1);
  assert.equal(ui.calls.filter(call => call.url.endsWith('/email')).length, 1);
  assert.match(ui.host.textContent, /Email di conferma inviata/);
});

test('uncertain response locks fields and retries the identical idempotent body', async t => {
  let attempts = 0;
  const ui = await setup(t, { send: async () => { if (++attempts === 1) throw new Error('connection lost'); return response({ orderId, passIds: [passId], replayed: true, emailStatus: 'sent' }); } });
  await ui.fill(); await ui.click(ui.confirm()); await ui.submit();
  assert.equal(ui.host.querySelector('#manual-0-firstName').closest('fieldset').disabled, true);
  const retry = [...ui.host.querySelectorAll('button')].find(button => button.textContent.includes('Verifica e riprova'));
  await ui.click(retry);
  const bodies = ui.calls.filter(call => call.url === '/api/admin/manual-enrollments').map(call => call.body);
  assert.deepEqual(bodies[0], bodies[1]); assert.match(ui.host.textContent, /Iscrizione registrata/);
});

test('upgrade keeps identity and QR, excludes already owned dinner and sends no new contacts or attribution', async t => {
  const ui = await setup(t, { upgrade: true });
  assert.equal(ui.host.querySelector('input[type=email]') === null, true);
  assert.equal(ui.host.textContent.includes('Cena · 20'), false);
  await ui.change('[aria-label="Formula partecipante 1"]', 'both');
  await ui.settle(); await ui.click(ui.confirm()); await ui.submit();
  const body = ui.calls.find(call => call.url === '/api/admin/manual-enrollments').body;
  assert.equal(body.upgradePassId, passId); assert.equal(body.expectedTotalCents, 2000);
  assert.equal('attendees' in body, false); assert.equal('affiliateId' in body, false);
  assert.equal(body.buyerEmail, 'ada@example.test'); assert.equal(body.participants[0].firstName, 'Ada');
  assert.match(ui.host.textContent, /mantiene il suo biglietto e QR/);
});

test('invalid identity prevents recording and leaves the form available to correct', async t => {
  const ui = await setup(t); await ui.fill(); await ui.change('#manual-0-document-number', 'INVALID');
  await ui.click(ui.confirm()); await ui.submit();
  assert.equal(ui.calls.some(call => call.url === '/api/admin/manual-enrollments'), false);
  assert.match(ui.host.textContent, /codice fiscale/i);
  assert.equal(ui.host.querySelector('#manual-0-document-number').getAttribute('aria-invalid'), 'true');
});

test('changed price requires the refreshed total and a fresh confirmation before another submission', async t => {
  let price = 3000; let sent = 0;
  const ui = await setup(t, {
    quoteHook: async body => response({ quote: { totalCents: price, participants: body.participants, lines: [{ label: 'Workshop', totalCents: price, activityIds: ['w'] }] } }),
    send: async () => { if (++sent === 1) { price = 3500; return response({ error: 'Il prezzo è cambiato.' }, 409); } return response({ orderId, passIds: [passId], replayed: false, emailStatus: 'sent' }); },
  });
  await ui.fill(); await ui.click(ui.confirm()); await ui.submit(); await ui.settle();
  assert.equal(ui.confirm().checked, false); await ui.submit();
  assert.equal(sent, 1);
  await ui.click(ui.confirm()); await ui.submit();
  const bodies = ui.calls.filter(call => call.url === '/api/admin/manual-enrollments').map(call => call.body);
  assert.equal(bodies[1].expectedTotalCents, 3500); assert.notEqual(bodies[0].requestId, bodies[1].requestId);
  assert.match(ui.host.textContent, /Iscrizione registrata/);
});
