import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
function load(path, mocks = {}, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), process: { env }, URL, Request, Response, Buffer, console: { error() {} } });
  return compiledModule.exports;
}
const templates = load('src/lib/email/meraki-template.ts');
const guestCopy = {
  it: /senza (?:creare )?(?:un )?account|senza registrazione|non (?:devi|serve).*account/i,
  en: /without (?:creating )?(?:an )?account|no account|no registration/i,
  de: /ohne (?:ein )?(?:Konto|Registrierung)|kein(?:e)? .*?(?:Konto|Registrierung)/i,
  es: /sin (?:crear )?(?:una )?(?:cuenta|registro)|no necesitas (?:crear )?(?:una )?cuenta/i,
};
const ticketLabels = {
  it: { participant: 'Partecipante', date: 'Data', time: 'Ora', venue: 'Luogo', package: 'Formula', includes: 'Il tuo biglietto include', menu: 'Menu scelto', timezone: 'ora italiana' },
  en: { participant: 'Participant', date: 'Date', time: 'Time', venue: 'Venue', package: 'Package', includes: 'Your ticket includes', menu: 'Selected menu', timezone: 'Italian time' },
  de: { participant: 'Teilnehmende Person', date: 'Datum', time: 'Uhrzeit', venue: 'Ort', package: 'Paket', includes: 'In deinem Ticket enthalten', menu: 'Gewähltes Menü', timezone: 'italienische Zeit' },
  es: { participant: 'Participante', date: 'Fecha', time: 'Hora', venue: 'Lugar', package: 'Paquete', includes: 'Tu entrada incluye', menu: 'Menú elegido', timezone: 'hora de Italia' },
};
function detailValue(document, label) {
  const field = [...document.querySelectorAll('p')].find(element => element.textContent.trim() === label);
  assert.ok(field, `Missing visible ticket label: ${label}`);
  return field.nextElementSibling?.textContent.trim();
}
const token = 'a'.repeat(64);
const request = (method, body, origin = 'https://meraki.example') => new Request(`https://meraki.example/api/marketing/preferences${method === 'GET' ? `?token=${token}` : ''}`, { method, ...(method === 'POST' ? { headers: { Origin: origin }, body: JSON.stringify(body) } : {}) });
function preferences(result) {
  const calls = [];
  return { calls, route: load('src/app/api/marketing/preferences/route.ts', { '@/lib/commerce/server': { commerceClient: () => ({ rpc: async (...args) => { calls.push(args); return result; } }) } }) };
}

test('all four ticket emails use the original PNG logo, readable ticket details and translated guest copy', async () => {
  for (const locale of ['it', 'en', 'de', 'es']) {
    let delivered;
    const mail = load('src/lib/resend/client.ts', {
      '@/lib/email/meraki-template': templates,
      '@/lib/i18n-utils': { getLocalizedText: value => value[locale] },
      '@/lib/supabase/server': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) }) },
      resend: { Resend: class { emails = { send: async (...args) => { delivered = args; return { error: null }; } }; } }, nodemailer: {}, qrcode: { toBuffer: async () => Buffer.from('png') },
    }, { RESEND_API_KEY: 'test-only', NEXT_PUBLIC_SITE_URL: 'https://meraki.example' });
    const result = await mail.sendTicketConfirmation({ id: 'ticket-1', qr_code: 'opaque', buyer_email: 'participant@example.test', buyer_nome: '<Ada>', buyer_cognome: 'Rossi' }, { titolo: { [locale]: '<Meraki>' }, data_inizio: '2026-11-18T23:30:00Z', location: 'Roma', indirizzo: 'Via <Meraki> 1' }, locale, {
      deliveryId: 'delivery-1', packageName: 'Formula <WS + MC>', accessNames: ['WS & MC', 'Cena'],
      accessDetails: [{ name: 'WS & MC', menuChoice: null }, { name: 'Cena', menuChoice: '<Vegetariano>' }],
      marketing: { confirmUrl: `https://meraki.example/${locale}/profilo/preferenze?token=${token}`, unsubscribeUrl: `https://meraki.example/${locale}/profilo/preferenze?token=${'b'.repeat(64)}` },
    });
    assert.equal(result.success, true);
    const sent = delivered[0];
    assert.equal(sent.to, 'participant@example.test');
    assert.match(sent.html, new RegExp(`<html lang="${locale}">`));
    assert.match(sent.html, /#f5f4f0/); assert.match(sent.html, /#18251f/); assert.match(sent.html, /#c2a36b/);
    assert.match(sent.html, /&lt;Ada&gt;/); assert.match(sent.html, /WS &amp; MC/);
    assert.match(sent.html, /Formula &lt;WS \+ MC&gt;/);
    assert.match(sent.html, /&lt;Vegetariano&gt;/);
    assert.match(sent.html, /Via &lt;Meraki&gt; 1/);
    const dom = new JSDOM(sent.html);
    const { document } = dom.window;
    const logo = [...document.querySelectorAll('img')].find(image => image.src.endsWith('/images/logo-meraki-email.png'));
    assert.ok(logo, 'the email header must use the approved original PNG artwork');
    assert.equal(new URL(logo.src).protocol, 'https:');
    assert.ok(logo.alt.includes('Meraki'));
    assert.ok(Number(logo.getAttribute('width')) > 0);
    assert.ok(Number(logo.getAttribute('height')) > 0);
    const bodyText = document.body.textContent.replace(/\s+/g, ' ');
    const labels = ticketLabels[locale];
    assert.equal(detailValue(document, labels.participant), '<Ada> Rossi');
    const localDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'Europe/Rome' }).format(new Date('2026-11-18T23:30:00Z'));
    assert.ok(detailValue(document, labels.date).includes(localDate), 'event date must use the Italian calendar day after UTC midnight');
    assert.equal(detailValue(document, labels.time), '00:30', 'event time stays in the Italian timezone and 24-hour format in every language');
    assert.equal(detailValue(document, labels.venue), 'Roma, Via <Meraki> 1');
    assert.equal(detailValue(document, labels.package), 'Formula <WS + MC>');
    assert.ok(bodyText.includes(labels.includes));
    assert.ok(bodyText.includes(labels.menu));
    assert.ok(bodyText.includes(labels.timezone));
    assert.ok(sent.text.includes(`${labels.time}: 00:30 (${labels.timezone})`));
    assert.match(bodyText, guestCopy[locale]);
    assert.match(sent.text, guestCopy[locale]);
    assert.ok(bodyText.includes('<Ada> Rossi'));
    assert.ok(bodyText.includes('Formula <WS + MC>'));
    assert.ok(bodyText.includes('<Vegetariano>'));
    const qr = document.querySelector('img[src="cid:meraki-ticket"]');
    assert.ok(qr?.alt.includes('QR'));
    const ticketLinks = [...document.querySelectorAll('a[href]')].filter(link => link.pathname.includes('/biglietto/'));
    assert.equal(ticketLinks.length, 2, 'ticket delivery offers the same action immediately and after the QR');
    const [firstTicketLink, ticketLink] = ticketLinks;
    assert.equal(firstTicketLink.href, ticketLink.href, 'both ticket actions must use the identical verified capability URL');
    const eventHeading = [...document.querySelectorAll('h2')].find(heading => heading.textContent === '<Meraki>');
    assert.ok(firstTicketLink.compareDocumentPosition(eventHeading) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the first action precedes the detailed event card');
    assert.ok(qr.compareDocumentPosition(ticketLink) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the repeated ticket action follows the visible QR');
    const helpLink = [...document.querySelectorAll('a[href]')].find(link => link.pathname === `/${locale}/contatti`);
    assert.ok(helpLink, 'support must have an actionable localized contact link');
    assert.ok(ticketLink.compareDocumentPosition(helpLink) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'post-purchase instructions and support follow the primary ticket action');
    dom.window.close();
    assert.ok(sent.text.includes(`/${locale}/biglietto/ticket-1?token=opaque`));
    assert.ok(sent.text.includes(templates.marketingEmailCopy[locale].ignore));
    assert.equal(sent.attachments[0].contentId, 'meraki-ticket');
    assert.equal(delivered[1].idempotencyKey, 'meraki-ticket-delivery-1');
  }
});

test('legacy tickets show their actual participant while omitting unknown packages, activities and menus', async () => {
  for (const locale of ['it', 'en', 'de', 'es']) {
    let sent;
    const mail = load('src/lib/resend/client.ts', {
      '@/lib/email/meraki-template': templates,
      '@/lib/i18n-utils': { getLocalizedText: value => value[locale] },
      '@/lib/supabase/server': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) }) },
      resend: { Resend: class { emails = { send: async value => { sent = value; return { error: null }; } }; } }, nodemailer: {}, qrcode: { toBuffer: async () => Buffer.from('png') },
    }, { RESEND_API_KEY: 'test-only', NEXT_PUBLIC_SITE_URL: 'https://meraki.example' });
    const result = await mail.sendTicketConfirmation({
      id: 'legacy-ticket', qr_code: 'legacy-opaque', buyer_email: 'legacy@example.test', buyer_nome: 'Ada', buyer_cognome: 'Rossi',
      buyer_telefono: '+390000000000', document_number: 'ES-PRIVATE-TEST-12345',
    }, { titolo: { [locale]: 'Esperienza Meraki' }, data_inizio: '2026-11-18T19:00:00Z', location: null, indirizzo: null }, locale);
    assert.equal(result.success, true);
    const dom = new JSDOM(sent.html);
    const { document } = dom.window;
    const labels = ticketLabels[locale];
    assert.equal(detailValue(document, labels.participant), 'Ada Rossi');
    for (const label of [labels.package, labels.includes, labels.menu, labels.venue]) {
      assert.equal([...document.querySelectorAll('p')].some(element => element.textContent.trim() === label), false, `Unknown legacy detail must stay absent: ${label}`);
    }
    assert.equal(document.querySelectorAll('img').length, 2, 'without a cover, only the brand logo and actual QR should be rendered');
    assert.equal([...document.querySelectorAll('a')].some(link => link.pathname.includes('/profilo/preferenze')), false);
    assert.match(sent.text, guestCopy[locale]);
    assert.equal(sent.to, 'legacy@example.test');
    assert.equal(`${sent.html}${sent.text}`.includes('+390000000000'), false);
    assert.equal(`${sent.html}${sent.text}`.includes('ES-PRIVATE-TEST-12345'), false);
    dom.window.close();
  }
});

test('the email shell uses absolute PNG artwork and keeps follow-up instructions after the primary action', () => {
  const html = templates.renderMerakiEmail({ locale: 'it', title: '<Titolo>', preheader: '<Anteprima>',
    bodyHtml: '<p id="ticket-body">Dettagli</p>', cta: { label: 'Apri biglietto', url: 'https://meraki.example/ticket?one=1&two=2' },
    afterCtaHtml: '<p id="after-ticket">Istruzioni dopo il pulsante</p>', siteUrl: 'https://preview.meraki.example',
  });
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const logo = document.querySelector('img[alt*="Meraki"]');
  assert.equal(logo.src, 'https://preview.meraki.example/images/logo-meraki-email.png');
  assert.equal(document.querySelector('h1').textContent, '<Titolo>');
  const action = [...document.querySelectorAll('a')].find(link => link.textContent === 'Apri biglietto');
  assert.equal([...document.querySelectorAll('a')].filter(link => link.textContent === 'Apri biglietto').length, 1, 'generic emails keep one action unless explicitly configured otherwise');
  assert.equal(action.href, 'https://meraki.example/ticket?one=1&two=2');
  assert.ok(action.compareDocumentPosition(document.getElementById('after-ticket')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(document.querySelectorAll('script,link[rel="stylesheet"]').length, 0);
  const asset = readFileSync(new URL('../public/images/logo-meraki-email.png', import.meta.url));
  assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  dom.window.close();
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
