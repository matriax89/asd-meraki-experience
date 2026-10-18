import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('../src/lib/commerce/attendee.ts', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require, Set }, { filename });
const { attendeeSchema, parseCheckoutAttendees, isValidItalianTaxCode, normalizePhone } = compiledModule.exports;
const person = () => ({ firstName: 'Ada', lastName: 'Rossi', email: 'Ada@Example.test', phone: '0039 333-1234567', documentType: 'codice_fiscale', documentCountry: 'IT', documentNumber: 'RSSMRA80A01H501U', marketingConsent: false });
const selection = () => ({ firstName: 'Ada', lastName: 'Rossi', packageId: 'ws', addonIds: [], menuChoices: {} });

test('guest details normalize email, international phone, and Italian identifiers without accepting invalid checksums', () => {
  const parsed = attendeeSchema.parse(person());
  assert.equal(parsed.email, 'ada@example.test');
  assert.equal(parsed.phone, '+393331234567');
  assert.equal(parsed.marketingConsent, false);
  assert.equal(normalizePhone('+49 (170) 123-4567'), '+491701234567');
  for (const code of ['RSSMRA80A01H501U', 'RSSMRA85T10A562S', '12345678903', '01114601006']) assert.equal(isValidItalianTaxCode(code), true);
  for (const code of ['RSSMRA80A01H501A', '12345678901', 'ABC123', '1234567890123456']) assert.equal(isValidItalianTaxCode(code), false);
  assert.equal(attendeeSchema.safeParse({ ...person(), documentNumber: 'RSSMRA80A01H501A' }).success, false);
});

test('foreign DNI/passport requires a real foreign country, safe identifier, and a reachable phone format', () => {
  const foreign = { ...person(), documentType: 'foreign_id', documentCountry: 'ES', documentNumber: '12345678Z', phone: '+34612345678' };
  assert.equal(attendeeSchema.safeParse(foreign).success, true);
  for (const override of [{ documentCountry: 'IT' }, { documentCountry: 'ZZ' }, { documentNumber: '<script>' }, { documentNumber: 'A' }, { phone: '3331234567' }, { phone: '+123' }, { email: 'invalid' }]) {
    assert.equal(attendeeSchema.safeParse({ ...foreign, ...override }).success, false);
  }
  assert.equal(attendeeSchema.safeParse({ ...person(), marketingConsent: 'true' }).success, false);
  assert.equal(attendeeSchema.safeParse({ ...person(), consentEligible: true }).success, false);
});

test('contacts match pricing participants by index even for identical names and remain outside quote objects', () => {
  const people = [selection(), selection()];
  const contacts = [person(), { ...person(), email: 'other@example.test', marketingConsent: true }];
  const parsed = parseCheckoutAttendees(contacts, people);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].email, 'other@example.test');
  assert.equal(parseCheckoutAttendees([person()], people), null);
  assert.equal(parseCheckoutAttendees([{ ...person(), firstName: 'Other' }], [selection()]), null);
  assert.equal(JSON.stringify(people).includes('documentNumber'), false);
  assert.equal(JSON.stringify(people).includes('email'), false);
  assert.equal(JSON.stringify(people).includes('marketingConsent'), false);
});
