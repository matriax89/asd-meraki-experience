import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
class RosterError extends Error { constructor(status, message) { super(message); this.status = status; } }
const eventId = '10000000-0000-4000-8000-000000000001';
const participantId = '30000000-0000-4000-8000-000000000001';
const details = { event: { id: eventId, title: 'Evento Meraki', startsAt: '2026-12-19T11:00:00Z', canceled: false }, participant: { id: participantId, source: 'commerce', firstName: 'Ada', lastName: 'Rossi', documentNumber: 'RSSMRA80A01H501U', contactAvailable: true } };
function route(loader = async () => details) {
  const calls = [];
  const source = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/participants/details/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Response, Request, URL, require: name => name === '@/lib/admin/participant-roster' ? { ParticipantRosterError: RosterError, loadParticipantDetails: async input => { calls.push(input); return loader(input); } } : require(name) });
  return { ...compiled.exports, calls };
}
const request = extra => new Request(`https://meraki.test/api/admin/participants/details?event=${eventId}&participant=${participantId}&source=commerce${extra || ''}`);
function privateResponse(response) {
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('the protected details endpoint returns the explicit event/person DTO with private no-store JSON', async () => {
  const api = route();
  const response = await api.GET(request());
  assert.equal(response.status, 200); privateResponse(response);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), details);
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [{ eventId, participantId, source: 'commerce', locale: 'it' }]);
});

test('locale and source are forwarded for server validation and duplicate or missing identities cannot broaden a details request', async () => {
  const api = route();
  await api.GET(request('&locale=de'));
  assert.equal(api.calls[0].locale, 'de');
  await api.GET(new Request(`https://meraki.test/api/admin/participants/details?event=${eventId}&participant=${participantId}&source=legacy&locale=es`));
  assert.equal(api.calls[1].source, 'legacy'); assert.equal(api.calls[1].locale, 'es');
  const validates = route(async input => { if (!input.participantId || !input.eventId || !input.source || !input.locale) throw new RosterError(400, 'Seleziona un partecipante valido.'); return details; });
  for (const url of [request(`&participant=${participantId}`), request(`&event=${eventId}`), request('&source=legacy'), request('&locale=it&locale=en'), new Request(`https://meraki.test/api/admin/participants/details?event=${eventId}&source=commerce`)]) {
    const response = await validates.GET(url);
    assert.equal(response.status, 400); privateResponse(response);
    assert.deepEqual(await response.json(), { error: 'Seleziona un partecipante valido.' });
  }
});

test('malformed detail requests still reach staff authorization and every failure stays private without leaking internal errors', async () => {
  const denied = route(async () => { throw new RosterError(403, 'Accedi con un account autorizzato.'); });
  const unauthorized = await denied.GET(new Request('https://meraki.test/api/admin/participants/details?event=invalid'));
  assert.equal(unauthorized.status, 403); assert.equal(denied.calls.length, 1); privateResponse(unauthorized);
  for (const status of [400, 403, 404, 503]) {
    const api = route(async () => { throw new RosterError(status, 'Richiesta non disponibile.'); });
    const response = await api.GET(request());
    assert.equal(response.status, status); privateResponse(response);
    assert.deepEqual(await response.json(), { error: 'Richiesta non disponibile.' });
  }
  const unexpected = route(async () => { throw new Error('PRIVATE DATABASE ERROR WITH TAX CODE'); });
  const response = await unexpected.GET(request());
  assert.equal(response.status, 503); privateResponse(response);
  assert.equal((await response.text()).includes('PRIVATE'), false);
});
