import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
const source = readFileSync(new URL("../src/components/meraki/commerce-public-model.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports, URL, Date, Set });
const { nextTierComparison } = exports;
const instant = (day) => `2099-07-${String(day).padStart(2, "0")}T00:00:00Z`;
const tier = (id, amountCents, startsAt = null, endsAt = null) => ({ id, label: id, amountCents, startsAt, endsAt });
const now = Date.parse(instant(10));

for (const [currentCents, nextCents, savingCents, savingPercent] of [[4500, 5500, 1000, 18.1], [3500, 4500, 1000, 22.2], [6500, 8500, 2000, 23.5]]) {
  test(`${currentCents / 100} to ${nextCents / 100} shows exact cents and conservatively truncated percent`, () => {
    const current = tier("early", currentCents, null, instant(15));
    const next = tier("standard", nextCents, instant(15));
    const comparison = nextTierComparison([current, next], now);
    assert.equal(comparison.current, current); assert.equal(comparison.next, next);
    assert.equal(comparison.savingCents, savingCents); assert.equal(comparison.savingPercent, savingPercent);
    assert.ok(comparison.savingPercent <= savingCents / nextCents * 100);
  });
}

test("unsorted schedules choose the chronological successor and preserve the original array", () => {
  const current = tier("early", 4500, instant(5), instant(15));
  const next = tier("standard", 5500, instant(15), instant(20));
  const later = tier("last-minute", 8500, instant(20));
  const prices = Object.freeze([later, next, current]);
  const comparison = nextTierComparison(prices, now);
  assert.equal(comparison.current, current); assert.equal(comparison.next, next);
  assert.deepEqual(prices.map((price) => price.id), ["last-minute", "standard", "early"]);
});

test("tier starts are inclusive and ends exclusive, including an immediate exact-boundary successor", () => {
  const current = tier("early", 4500, instant(5), instant(15));
  const next = tier("standard", 5500, instant(15), instant(20));
  const later = tier("last-minute", 8500, instant(20));
  const prices = [later, next, current];
  assert.equal(nextTierComparison(prices, Date.parse(instant(5))).current, current);
  assert.equal(nextTierComparison(prices, Date.parse(instant(15)) - 1).next, next);
  const atBoundary = nextTierComparison(prices, Date.parse(instant(15)));
  assert.equal(atBoundary.current, next); assert.equal(atBoundary.next, later);
  assert.equal(atBoundary.savingCents, 3000); assert.equal(atBoundary.savingPercent, 35.2);
  assert.equal(nextTierComparison(prices, Date.parse(instant(20))), null);
});

test("a future successor after a sales gap is compared while an instant inside the gap has no current price", () => {
  const current = tier("early", 4500, null, instant(15));
  const next = tier("standard", 5500, instant(17));
  const comparison = nextTierComparison([next, current], now);
  assert.equal(comparison.next, next); assert.equal(comparison.savingCents, 1000);
  assert.equal(nextTierComparison([current, next], Date.parse(instant(16))), null);
});

test("missing current tier, missing deadline or missing future successor never invents a comparison", () => {
  assert.equal(nextTierComparison([], now), null);
  assert.equal(nextTierComparison([tier("future", 5500, instant(15))], now), null);
  assert.equal(nextTierComparison([tier("expired", 4500, null, instant(5))], now), null);
  assert.equal(nextTierComparison([tier("current", 4500)], now), null);
  assert.equal(nextTierComparison([tier("current", 4500, null, instant(15))], now), null);
  assert.equal(nextTierComparison([tier("current", 4500, null, instant(15)), tier("past", 3500, instant(1), instant(5))], now), null);
});

for (const nextAmount of [4500, 3500, 0]) {
  test(`an immediate next price of ${nextAmount} returns zero savings and cannot be skipped for a later increase`, () => {
    const current = tier("current", 4500, null, instant(15));
    const next = tier("next", nextAmount, instant(15), instant(20));
    const later = tier("higher-later", 8500, instant(20));
    const comparison = nextTierComparison([later, current, next], now);
    assert.equal(comparison.next, next); assert.equal(comparison.savingCents, 0); assert.equal(comparison.savingPercent, 0);
  });
}

test("unsafe, fractional or negative cents suppress a misleading comparison without skipping the next tier", () => {
  for (const invalid of [-1, 4500.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(nextTierComparison([tier("current", invalid, null, instant(15)), tier("next", 5500, instant(15))], now), null);
    assert.equal(nextTierComparison([tier("current", 4500, null, instant(15)), tier("next", invalid, instant(15), instant(20)), tier("later", 8500, instant(20))], now), null);
  }
});

test("safe integer cent values retain exact conservative percentages even when multiplied cents exceed the safe range", () => {
  const current = tier("current", 1, null, instant(15));
  const next = tier("next", Number.MAX_SAFE_INTEGER, instant(15));
  const comparison = nextTierComparison([current, next], now);
  assert.equal(comparison.savingCents, Number.MAX_SAFE_INTEGER - 1); assert.equal(comparison.savingPercent, 99.9);
  const free = nextTierComparison([tier("free", 0, null, instant(15)), tier("next", 1, instant(15))], now);
  assert.equal(free.savingPercent, 100);
});

test("invalid instants and malformed schedule dates cannot produce a price comparison", () => {
  const prices = [tier("current", 4500, null, instant(15)), tier("next", 5500, instant(15))];
  assert.equal(nextTierComparison(prices, NaN), null); assert.equal(nextTierComparison(prices, Infinity), null);
  assert.equal(nextTierComparison([tier("current", 4500, null, "not-a-date"), tier("next", 5500, instant(15))], now), null);
  assert.equal(nextTierComparison([tier("current", 4500, null, instant(15)), tier("next", 5500, "not-a-date")], now), null);
});
