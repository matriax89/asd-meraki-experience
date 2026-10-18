import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, mocks = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), URL, console, ...globals });
  return compiledModule.exports;
}
const controller = load('src/lib/facebook-pixel.ts');
const fixture = (route = '/it', consent) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: `https://meraki.example${route}` });
  if (consent !== undefined) dom.window.localStorage.setItem(controller.COOKIE_CONSENT_KEY, JSON.stringify(consent));
  return dom;
};
const script = win => win.document.querySelector('script[src*="connect.facebook.net"]');
const pageViews = win => (win.fbq?.queue || []).filter(args => args[0] === 'track' && args[1] === 'PageView').length;

test('no third-party pixel load without explicit boolean marketing consent', () => {
  for (const consent of [undefined, null, {}, { marketing: false }, { analytics: true }, { marketing: 'true' }]) {
    const dom = fixture('/it', consent);
    controller.synchronizeFacebookPixel(dom.window);
    assert.equal(script(dom.window), null); assert.equal(dom.window.fbq, undefined);
    dom.window.close();
  }
  const dom = fixture();
  dom.window.localStorage.setItem(controller.COOKIE_CONSENT_KEY, '{broken');
  controller.synchronizeFacebookPixel(dom.window); assert.equal(script(dom.window), null);
  Object.defineProperty(dom.window, 'localStorage', { get() { throw Error('storage unavailable'); } });
  controller.synchronizeFacebookPixel(dom.window); assert.equal(script(dom.window), null);
  dom.window.close();
});

test('all private/bearer routes suppress SDK injection even with saved opt-in', () => {
  for (const route of ['/it/biglietto/id?token=secret', '/en/biglietti', '/de/pagamento?session_id=secret', '/es/admin/contatti/partecipanti', '/es/profilo/preferenze?token=secret', '/it/eventi?token=secret', '/it/%61dmin/contatti']) {
    const dom = fixture(route, { marketing: true });
    controller.synchronizeFacebookPixel(dom.window);
    assert.equal(script(dom.window), null, route); assert.equal(dom.window.fbq, undefined, route);
    dom.window.close();
  }
});

test('public opt-in loads once with manual-only configuration and tracks only after load', () => {
  const dom = fixture('/it', { marketing: true }); const win = dom.window;
  controller.synchronizeFacebookPixel(win);
  const sdk = script(win); assert.ok(sdk); assert.equal(sdk.referrerPolicy, 'no-referrer');
  assert.equal(pageViews(win), 0, 'Never queue PageView while the SDK is still loading');
  const configIndex = win.fbq.queue.findIndex(args => args[0] === 'set' && args[1] === 'autoConfig' && args[2] === false);
  const initIndex = win.fbq.queue.findIndex(args => args[0] === 'init');
  assert.ok(configIndex >= 0 && configIndex < initIndex);
  sdk.dispatchEvent(new win.Event('load')); assert.equal(pageViews(win), 1);
  controller.synchronizeFacebookPixel(win); assert.equal(pageViews(win), 1);
  assert.equal(win.document.querySelectorAll('script[src*="connect.facebook.net"]').length, 1);
  win.history.pushState({}, '', '/en/chi-siamo');
  controller.synchronizeFacebookPixel(win); assert.equal(pageViews(win), 2);
  dom.window.close();
});

test('pending SDK load rechecks private navigation and never queues bearer PageView', () => {
  const dom = fixture('/it', { marketing: true }); const win = dom.window;
  controller.synchronizeFacebookPixel(win); const sdk = script(win);
  win.history.pushState({}, '', '/es/profilo/preferenze?token=secret');
  sdk.dispatchEvent(new win.Event('load'));
  assert.equal(pageViews(win), 0); assert.equal(script(win), null);
  assert.equal(controller.synchronizeFacebookPixel(win), true, 'An already active SDK requires a fresh private document');
  assert.deepEqual(JSON.parse(JSON.stringify(win.fbq.queue.at(-1))), ['consent', 'revoke']);
  dom.window.close();
});

test('revocation is immediate, survives stale storage in current tab and blocks pending tracking', () => {
  const dom = fixture('/it', { marketing: true }); const win = dom.window;
  controller.synchronizeFacebookPixel(win); const sdk = script(win);
  controller.synchronizeFacebookPixel(win, false);
  sdk.dispatchEvent(new win.Event('load')); assert.equal(pageViews(win), 0);
  controller.synchronizeFacebookPixel(win); assert.equal(pageViews(win), 0);
  controller.synchronizeFacebookPixel(win, true); assert.equal(pageViews(win), 1);
  dom.window.close();
});

test('cookie acceptance and revocation notify the central controller without duplicate tracking', async context => {
  const React = require('react'); const { act } = React;
  const dom = fixture('/it'); const win = dom.window;
  win.document.body.innerHTML = '<div id="app"></div>';
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, Element: win.Element, CustomEvent: win.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const modules = { '@/lib/facebook-pixel': controller, 'next/navigation': { usePathname: () => '/it', useSearchParams: () => null } };
  const pixel = load('src/components/public/facebook-pixel-events.tsx', modules, { window: win, document: win.document, Element: win.Element, URL });
  const hook = load('src/hooks/use-cookie-consent.ts', modules, { window: win, localStorage: win.localStorage, CustomEvent: win.CustomEvent });
  function Controls() { const consent = hook.useCookieConsent(); return React.createElement('div', null, React.createElement('button', { id: 'accept', onClick: consent.acceptAll }, 'Accept'), React.createElement('button', { id: 'reject', onClick: consent.rejectAll }, 'Reject')); }
  const { createRoot } = require('react-dom/client'); const root = createRoot(win.document.getElementById('app'));
  context.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of globals) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key];
  });
  await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(pixel.FacebookPixelEvents), React.createElement(Controls))));
  assert.equal(script(win), null);
  await act(async () => win.document.getElementById('accept').dispatchEvent(new win.MouseEvent('click', { bubbles: true })));
  assert.ok(script(win)); assert.equal(pageViews(win), 0);
  await act(async () => script(win).dispatchEvent(new win.Event('load'))); assert.equal(pageViews(win), 1);
  await act(async () => win.document.getElementById('reject').dispatchEvent(new win.MouseEvent('click', { bubbles: true })));
  assert.equal(pageViews(win), 1); assert.deepEqual(JSON.parse(JSON.stringify(win.fbq.queue.at(-1))), ['consent', 'revoke']);
});

test('locale layout has no unconditional tracker bootstrap or no-script tracking image', () => {
  const layout = readFileSync(new URL('../src/app/[locale]/layout.tsx', import.meta.url), 'utf8');
  assert.equal(layout.includes('fbevents.js'), false);
  assert.equal(layout.includes('facebook.com/tr'), false);
  assert.equal(layout.includes('fb-pixel-init'), false);
});
