import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), process: { env }, URL, Request, Response, Buffer, console: { error() {} } });
  return compiledModule.exports;
}
const templates = load('src/lib/email/meraki-template.ts');
const token = 'a'.repeat(64);
const request = (method, body, origin = 'https://meraki.example') => new Request(`https://meraki.example/api/marketing/preferences${method === 'GET' ? `?token=${token}` : ''}`, { method, ...(method === 'POST' ? { headers: { Origin: origin }, body: JSON.stringify(body) } : {}) });
function preferences(result) {
  const calls = [];
  return { calls, route: load('src/app/api/marketing/preferences/route.ts', { '@/lib/commerce/server': { commerceClient: () => ({ rpc: async (...args) => { calls.push(args); return result; } }) } }) };
}

test('all four ticket emails use one Meraki theme, translated guest copy and plain text', async () => {
  for (const locale of ['it', 'en', 'de', 'es']) {
    let delivered;
    const mail = load('src/lib/resend/client.ts', {
      '@/lib/email/meraki-template': templates,
      '@/lib/i18n-utils': { getLocalizedText: value => value[locale] },
      '@/lib/supabase/server': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) }) },
      resend: { Resend: class { emails = { send: async (...args) => { delivered = args; return { error: null }; } }; } }, nodemailer: {}, qrcode: { toBuffer: async () => Buffer.from('png') },
    }, { RESEND_API_KEY: 'test-only', NEXT_PUBLIC_SITE_URL: 'https://meraki.example' });
    const result = await mail.sendTicketConfirmation({ id: 'ticket-1', qr_code: 'opaque', buyer_email: 'participant@example.test', buyer_nome: '<Ada>', buyer_cognome: 'Rossi' }, { titolo: { [locale]: '<Meraki>' }, data_inizio: '2026-11-18T19:00:00Z', location: 'Roma', indirizzo: null }, locale, { deliveryId: 'delivery-1', accessNames: ['WS & MC'], marketing: { confirmUrl: `https://meraki.example/${locale}/profilo/preferenze?token=${token}`, unsubscribeUrl: `https://meraki.example/${locale}/profilo/preferenze?token=${'b'.repeat(64)}` } });
    assert.equal(result.success, true);
    const sent = delivered[0];
    assert.equal(sent.to, 'participant@example.test');
    assert.match(sent.html, new RegExp(`<html lang="${locale}">`));
    assert.match(sent.html, /#f5f4f0/); assert.match(sent.html, /#18251f/); assert.match(sent.html, /#c2a36b/);
    assert.match(sent.html, /&lt;Ada&gt;/); assert.match(sent.html, /WS &amp; MC/);
    assert.ok(sent.text.includes(`/${locale}/biglietto/ticket-1?token=opaque`));
    assert.ok(sent.text.includes(templates.marketingEmailCopy[locale].ignore));
    assert.equal(sent.attachments[0].contentId, 'meraki-ticket');
    assert.equal(delivered[1].idempotencyKey, 'meraki-ticket-delivery-1');
  }
});

test('ticket delivery does not add marketing consent when no opt-in links exist', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(templates.marketingEmailSection('es'))), { html: '', text: '' });
  const unsubOnly = templates.marketingEmailSection('en', { unsubscribeUrl: 'https://meraki.example/prefs' });
  assert.equal(unsubOnly.html.includes('Confirm Meraki updates'), false);
  assert.match(unsubOnly.html, /withdraw consent/);
});

test('consent GET looks up only, returns no address or document, and never mutates', async () => {
  const { route, calls } = preferences({ data: { status: 'pending', locale: 'es', can_confirm: true, can_unsubscribe: true, email: 'private@example.test', document: 'secret' } });
  const response = await route.GET(request('GET'));
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], 'lookup_marketing_preference');
  assert.deepEqual(await response.json(), { status: 'pending', canConfirm: true, canUnsubscribe: true });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('explicit confirmation and revocation use separate RPCs and require valid capability', async () => {
  for (const [action, rpc, status] of [['confirm', 'confirm_marketing_consent', 'subscribed'], ['unsubscribe', 'unsubscribe_marketing_consent', 'unsubscribed']]) {
    const { route, calls } = preferences({ data: { status } });
    assert.equal((await route.POST(request('POST', { token, action }))).status, 200);
    assert.equal(calls[0][0], rpc); assert.equal(calls[0][1].p_token, token);
  }
  const { route, calls } = preferences({ data: { error: 'invalid_token' } });
  assert.equal((await route.POST(request('POST', { token, action: 'confirm' }))).status, 404);
  assert.equal((await route.POST(request('POST', { token, action: 'confirm' }, 'https://foreign.example'))).status, 403);
  assert.equal((await route.POST(request('POST', { token: 'short', action: 'confirm' }))).status, 400);
  assert.equal(calls.length, 1);
});

test('marketing helper creates independent random tokens without exposing private contact data', async () => {
  const calls = [];
  const helper = load('src/lib/email/marketing.ts', { './meraki-template': templates, '@/lib/commerce/server': { commerceClient: () => ({ rpc: async (...args) => { calls.push(args); return { data: { status: 'pending' } }; } }) } }, { NEXT_PUBLIC_SITE_URL: 'https://meraki.example' });
  const links = await helper.prepareMarketingEmailLinks('order-1', 2, 'es');
  assert.equal(calls[0][0], 'prepare_marketing_consent');
  assert.equal(calls[0][1].p_order_id, 'order-1'); assert.equal(calls[0][1].p_participant_index, 2);
  assert.match(calls[0][1].p_confirmation_token, /^[a-f0-9]{64}$/); assert.match(calls[0][1].p_unsubscribe_token, /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0][1].p_confirmation_token, calls[0][1].p_unsubscribe_token);
  assert.match(links.confirmUrl, /\/es\/profilo\/preferenze\?token=[a-f0-9]{64}$/);
  assert.match(links.unsubscribeUrl, /\/es\/profilo\/preferenze\?token=[a-f0-9]{64}$/);
  const unavailable = load('src/lib/email/marketing.ts', { './meraki-template': templates, '@/lib/commerce/server': { commerceClient: () => { throw Error('offline'); } } });
  assert.equal(await unavailable.prepareMarketingEmailLinks('order-1', 2, 'it'), undefined);
});

test('campaign export authenticates every request and includes only confirmed subscribers with minimal fields', async () => {
  const calls = [];
  const query = { select(value) { calls.push(['select', value]); return this; }, eq(...args) { calls.push(['eq', ...args]); return this; }, not(...args) { calls.push(['not', ...args]); return this; }, order() { return this; }, range: async () => ({ data: [{ email: 'ada@example.test', first_name: '=HYPERLINK("evil")', last_name: 'Rossi', locale: 'es', confirmed_at: '2026-10-18T16:00:00Z' }] }) };
  const helper = load('src/lib/email/marketing.ts', { './meraki-template': templates, '@/lib/commerce/server': {} });
  const route = load('src/app/api/marketing/export/route.ts', { '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => ({ from(table) { assert.equal(table, 'marketing_contacts'); return query; } }) }, '@/lib/email/marketing': helper });
  const response = await route.GET(); const csv = await response.text();
  assert.equal(response.status, 200);
  assert.ok(calls.some(row => row[0] === 'eq' && row[1] === 'status' && row[2] === 'subscribed'));
  assert.ok(calls.some(row => row[0] === 'not' && row[1] === 'confirmed_at'));
  assert.equal(calls[0][1].includes('phone'), false); assert.equal(calls[0][1].includes('document'), false);
  assert.match(csv, /"'=HYPERLINK\(""evil""\)"/);
  const denied = load('src/app/api/marketing/export/route.ts', { '@/lib/commerce/admin-auth': { requireCommerceStaff: async () => { throw Error('denied'); } }, '@/lib/email/marketing': helper });
  assert.equal((await denied.GET()).status, 403);
});

test('public preferences never confirm on open and require explicit confirmation or revocation', async context => {
  const { JSDOM } = require('jsdom');
  const React = require('react');
  const { act } = React;
  const dom = new JSDOM('<!doctype html><html><body><div id="preferences"></div></body></html>', { url: `https://meraki.example/es/profilo/preferenze?token=${token}` });
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const calls = [];
  const Anchor = ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children);
  const path = 'src/components/meraki/email-preferences.tsx';
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name === '@/i18n/routing' ? { Link: Anchor } : require(name), AbortController, fetch: async (url, options) => {
    calls.push([url, options]);
    return { ok: true, json: async () => options.method === 'POST' ? { status: 'subscribed' } : { status: 'pending', canConfirm: true, canUnsubscribe: false } };
  } });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('preferences'));
  context.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of globals) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key];
  });
  await act(async () => root.render(React.createElement(compiledModule.exports.EmailPreferences, { locale: 'es', token })));
  assert.equal(calls.length, 1); assert.equal(calls[0][1].method, undefined);
  assert.match(dom.window.document.querySelector('h1').textContent, /Tus emails/);
  const confirm = dom.window.document.querySelector('button');
  assert.match(confirm.textContent, /Confirmo/);
  await act(async () => confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  assert.equal(calls.length, 2); assert.equal(calls[1][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1][1].body), { token, action: 'confirm' });
  assert.match(dom.window.document.querySelector('[role="status"]').textContent, /confirmado/);
  assert.equal(dom.window.document.querySelectorAll('button').length, 0, 'A confirmation token must not offer revocation requiring another token');
});
