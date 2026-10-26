import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('../src/lib/commerce/phone-country.ts', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require }, { filename });
const { PHONE_COUNTRIES, defaultPhoneCountry, phoneCallingCode, phoneCountryForNumber, normalizeCountryPhone, changePhoneCountry } = compiledModule.exports;

test('the country selector covers supported calling countries with explicit locale defaults', () => {
  assert.ok(PHONE_COUNTRIES.length > 240);
  for (const country of PHONE_COUNTRIES) assert.match(phoneCallingCode(country), /^\+[1-9]\d{0,2}$/);
  assert.equal(defaultPhoneCountry('it'), 'IT');
  assert.equal(defaultPhoneCountry('en'), 'GB');
  assert.equal(defaultPhoneCountry('de'), 'DE');
  assert.equal(defaultPhoneCountry('es'), 'ES');
  assert.equal(defaultPhoneCountry('unknown'), 'IT');
  assert.equal(phoneCallingCode('IT'), '+39');
  assert.equal(phoneCallingCode('US'), '+1');
  assert.equal(phoneCallingCode('CA'), '+1');
});

test('national numbers receive the selected prefix and preserve Italian landline zeroes', () => {
  for (const [country, national, international] of [
    ['IT', '333 123 4567', '+393331234567'],
    ['IT', '02 1234 5678', '+390212345678'],
    ['GB', '07700 900123', '+447700900123'],
    ['DE', '030 123456', '+4930123456'],
    ['FR', '06 12 34 56 78', '+33612345678'],
    ['ES', '612 345 678', '+34612345678'],
    ['US', '(213) 373-4253', '+12133734253'],
    ['CA', '(204) 555-1234', '+12045551234'],
  ]) assert.equal(normalizeCountryPhone(national, country), international);
});

test('pasted international numbers and 00 prefixes never acquire a second calling code', () => {
  for (const input of ['+39 333 123 4567', '0039 333 123 4567', '+39 (333) 123-4567']) {
    assert.equal(normalizeCountryPhone(input, 'GB'), '+393331234567');
    assert.equal(phoneCountryForNumber(input, 'GB'), 'IT');
  }
  assert.equal(normalizeCountryPhone('+49 (030) 123456', 'IT'), '+4930123456');
  assert.equal(normalizeCountryPhone('+44 07700 900123', 'IT'), '+447700900123');
});

test('typing national numbers one digit at a time retains digits across prefix insertion', () => {
  for (const [country, national, expected] of [
    ['IT', '0212345678', '+390212345678'],
    ['GB', '07700900123', '+447700900123'],
    ['DE', '015112345678', '+4915112345678'],
    ['FR', '0612345678', '+33612345678'],
    ['RU', '89123456789', '+79123456789'],
    ['US', '12133734253', '+12133734253'],
    ['IT', '00393331234567', '+393331234567'],
    ['GB', '00393331234567', '+393331234567'],
  ]) {
    let value = '';
    for (const digit of national) value = normalizeCountryPhone(value + digit, country);
    assert.equal(value, expected);
  }
});

test('country changes replace only the international prefix and keep the number', () => {
  assert.equal(changePhoneCountry('+393331234567', 'IT', 'ES'), '+343331234567');
  assert.equal(changePhoneCountry('+34 333 123 4567', 'ES', 'DE'), '+493331234567');
  assert.equal(changePhoneCountry('3331234567', 'IT', 'GB'), '+443331234567');
  assert.equal(changePhoneCountry('0039 333 1234567', 'IT', 'FR'), '+333331234567');
  assert.equal(changePhoneCountry('+12045551234', 'CA', 'US'), '+12045551234');
  assert.equal(changePhoneCountry('', 'IT', 'DE'), '+49');
  assert.equal(changePhoneCountry('+39', 'IT', 'GB'), '+44');
  assert.equal(changePhoneCountry('+', 'IT', 'GB'), '+44');
  assert.equal(changePhoneCountry('+3', 'IT', 'FR'), '+33');
  assert.equal(changePhoneCountry('+999123456', 'IT', 'FR'), '+999123456');
});

test('shared calling codes stay stable while incomplete and detect a complete pasted number', () => {
  assert.equal(phoneCountryForNumber('+1', 'CA'), 'CA');
  assert.equal(phoneCountryForNumber('+1213', 'CA'), 'CA');
  assert.equal(phoneCountryForNumber('+1', 'IT'), 'US');
  assert.equal(phoneCountryForNumber('+44', 'IT'), 'GB');
  assert.equal(phoneCountryForNumber('+44', 'JE'), 'JE');
  assert.equal(phoneCountryForNumber('+12045551234', 'US'), 'CA');
  assert.equal(phoneCountryForNumber('+12133734253', 'CA'), 'US');
  assert.equal(phoneCountryForNumber('+393331234567', 'GB'), 'IT');
  assert.equal(phoneCountryForNumber('3331234567', 'IT'), 'IT');
});

test('clearing or editing an incomplete number remains possible without hiding invalid characters', () => {
  for (const input of ['', '+', '0', '00']) assert.equal(normalizeCountryPhone(input, 'IT'), input);
  assert.equal(normalizeCountryPhone('+39', 'IT'), '+39');
  assert.equal(normalizeCountryPhone('3', 'IT'), '+393');
  for (const input of ['hello', '+39333abc1234567', '+39+3331234567', '333/1234567']) {
    assert.equal(normalizeCountryPhone(input, 'IT'), input);
    assert.equal(changePhoneCountry(input, 'IT', 'GB'), input);
  }
  assert.equal(phoneCountryForNumber('+999123456', 'IT'), 'IT');
  assert.equal(phoneCountryForNumber('+80012345678', 'IT'), 'IT');
});
