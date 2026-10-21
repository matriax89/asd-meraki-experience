import assert from "node:assert/strict";
import test from "node:test";
import { dateFormatModule } from "./helpers/date-format-modules.mjs";

const { formatEventDate } = dateFormatModule;
const full = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const numeric = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

for (const [locale, expected] of [
  ["it", "sabato 19 dicembre 2026"],
  ["en", "Saturday, 19 December 2026"],
  ["de", "Samstag, 19. Dezember 2026"],
  ["es", "sábado, 19 de diciembre de 2026"],
]) {
  test(`${locale}: event dates use the selected weekday and month language`, () => {
    assert.equal(formatEventDate("2026-12-19T11:30:00Z", locale, full), expected);
  });
  test(`${locale}: numeric dates remain day/month/year and times remain 24-hour Rome time`, () => {
    assert.equal(formatEventDate("2026-08-04T22:30:00Z", locale, numeric), "05/08/2026, 00:30");
    assert.equal(formatEventDate("2026-11-18T23:30:00Z", locale, numeric), "19/11/2026, 00:30");
    assert.equal(formatEventDate("2026-03-29T00:30:00Z", locale, numeric), "29/03/2026, 01:30");
    assert.equal(formatEventDate("2026-03-29T01:30:00Z", locale, numeric), "29/03/2026, 03:30");
    assert.equal(formatEventDate("2026-10-25T00:30:00Z", locale, numeric), "25/10/2026, 02:30");
    assert.equal(formatEventDate("2026-10-25T01:30:00Z", locale, numeric), "25/10/2026, 02:30");
  });
}

test("regional language tags and unsupported languages have a predictable calendar fallback", () => {
  for (const [regional, language] of [["en-US", "en"], ["EN-gb", "en"], ["de-AT", "de"], ["es-AR", "es"], ["it-CH", "it"], ["fr-FR", "it"], ["constructor", "it"]]) {
    assert.equal(formatEventDate("2026-12-19T11:30:00Z", regional, full), formatEventDate("2026-12-19T11:30:00Z", language, full));
  }
});

test("long ticket dates translate their calendar words and keep midnight padded to HH:mm", () => {
  const date = new Date("2026-11-18T23:30:00Z");
  const before = date.getTime();
  for (const [locale, expected] of [
    ["it", "19 novembre 2026 alle ore 00:30"],
    ["en", "19 November 2026 at 00:30"],
    ["de", "19. November 2026 um 00:30"],
    ["es", "19 de noviembre de 2026, 00:30"],
  ]) assert.equal(formatEventDate(date, locale, { dateStyle: "long", timeStyle: "short" }), expected);
  assert.equal(date.getTime(), before);
});

test("public formatting cannot accidentally replace the venue timezone or reintroduce AM/PM", () => {
  assert.equal(formatEventDate("2026-08-04T22:30:00Z", "en", { ...numeric, timeZone: "America/New_York", hour12: true }), "05/08/2026, 00:30");
});
