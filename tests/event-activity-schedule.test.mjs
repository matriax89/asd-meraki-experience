import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, modules = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Intl, require: name => modules[name] || require(name) });
  return exports;
}
const { EventActivitySchedule, hasActivitySchedule } = load("components/meraki/event-activity-schedule.tsx", { "@/lib/commerce/localization": load("lib/commerce/localization.ts") });
const activity = (id, overrides = {}) => ({ id, name: id, kind: "extra", startsAt: null, endsAt: null, checkInStartsAt: null, salesEnd: null, capacity: 50, menuOptions: [], ...overrides });
const workshop = activity("ws", { name: "Workshop", nameTranslations: { en: "Workshop", de: "Workshop", es: "Taller" }, kind: "workshop", startsAt: "2026-12-19T11:30:00Z", endsAt: "2026-12-19T14:30:00Z", checkInStartsAt: "2026-12-19T11:00:00Z" });
const masterclass = activity("mc", { name: "Masterclass", nameTranslations: { en: "Masterclass", de: "Masterclass", es: "Clase magistral" }, kind: "masterclass", startsAt: "2026-12-19T15:30:00Z", endsAt: "2026-12-19T17:00:00Z", checkInStartsAt: "2026-12-19T15:00:00Z" });
const render = (activities, locale = "it", eventStartsAt = workshop.startsAt) => JSDOM.fragment(renderToStaticMarkup(React.createElement(EventActivitySchedule, { activities, locale, eventStartsAt })));
const copies = {
  it: { title: "Programma e check-in", checkIn: "Check-in dalle", activity: "Orario attività", zone: "ora italiana", mc: "Masterclass", ws: "Workshop" },
  en: { title: "Schedule and check-in", checkIn: "Check-in opens at", activity: "Activity time", zone: "Italian time", mc: "Masterclass", ws: "Workshop" },
  de: { title: "Programm und Check-in", checkIn: "Check-in ab", activity: "Uhrzeit", zone: "Italien", mc: "Masterclass", ws: "Workshop" },
  es: { title: "Programa y check-in", checkIn: "Check-in desde", activity: "Horario de la actividad", zone: "hora de Italia", mc: "Clase magistral", ws: "Taller" },
};

for (const [locale, copy] of Object.entries(copies)) test(`${locale}: each activity has its own check-in and time range in Italian time`, () => {
  const document = render([masterclass, workshop, activity("dinner", { name: "Cena", kind: "dinner" })], locale);
  const section = document.querySelector("[data-activity-schedule]");
  assert.equal(section.getAttribute("aria-label"), copy.title);
  assert.equal(section.querySelector("h2").textContent, copy.title);
  assert.ok(section.textContent.includes(copy.zone));
  assert.ok(section.textContent.includes("Europe/Rome"));
  const cards = [...section.querySelectorAll("[data-activity-id]")];
  assert.deepEqual(cards.map(card => card.getAttribute("data-activity-id")), ["ws", "mc"], "the agenda is chronological and never renders an unscheduled extra");
  assert.equal(cards[0].querySelector("h3").textContent, copy.ws);
  assert.equal(cards[1].querySelector("h3").textContent, copy.mc);
  for (const [card, details, opening, range] of [[cards[0], workshop, "12:00", ["12:30", "15:30"]], [cards[1], masterclass, "16:00", ["16:30", "18:00"]]]) {
    const checkIn = card.querySelector("[data-activity-check-in]");
    assert.ok(checkIn.textContent.includes(copy.checkIn));
    assert.equal(checkIn.querySelector("time").textContent, opening);
    assert.equal(checkIn.querySelector("time").getAttribute("datetime"), details.checkInStartsAt);
    assert.ok(card.textContent.includes(copy.activity));
    assert.deepEqual([...card.querySelectorAll("[data-activity-time] time")].map(time => time.textContent), range);
    assert.deepEqual([...card.querySelectorAll("[data-activity-time] time")].map(time => time.getAttribute("datetime")), [details.startsAt, details.endsAt]);
    assert.doesNotMatch(card.textContent, /AM|PM|December|Dezember|diciembre/);
  }
});

test("old activities retain their start without inventing check-in or end from salesEnd", () => {
  const legacy = activity("ws", { name: "Workshop", startsAt: workshop.startsAt, salesEnd: "2026-12-18T09:00:00Z" });
  delete legacy.endsAt;
  delete legacy.checkInStartsAt;
  const document = render([legacy]);
  assert.equal(document.querySelector("[data-activity-check-in]"), null);
  assert.equal(document.querySelectorAll("time").length, 1);
  assert.equal(document.querySelector("time").textContent, "12:30");
  assert.ok(document.textContent.includes("Inizio attività"));
  assert.doesNotMatch(document.textContent, /09:00|10:00|18\/12/);
});

test("empty and invalid timing produces no blank agenda or fictional date", () => {
  for (const activities of [[], [activity("blank")], [activity("broken", { startsAt: "invalid", endsAt: "", checkInStartsAt: "not-a-date", salesEnd: workshop.startsAt })]]) {
    assert.equal(hasActivitySchedule(activities), false);
    assert.equal(render(activities).childNodes.length, 0);
  }
  assert.equal(hasActivitySchedule([workshop]), true);
});

test("previous-day check-in, a different activity day and an overnight ending show their dates explicitly", () => {
  const document = render([activity("overnight", { name: "Esperienza notturna", startsAt: "2026-12-20T22:30:00Z", endsAt: "2026-12-21T00:30:00Z", checkInStartsAt: "2026-12-18T23:30:00Z" })]);
  const card = document.querySelector("[data-activity-id]");
  assert.equal(card.querySelector("header time").textContent, "20/12/2026");
  assert.equal(card.querySelector("[data-activity-check-in] time").textContent, "19/12/2026, 00:30", "the check-in date remains explicit when it differs from the activity card's date");
  assert.deepEqual([...card.querySelectorAll("[data-activity-time] time")].map(time => time.textContent), ["23:30", "21/12/2026, 01:30"]);
  const previous = render([{ ...workshop, checkInStartsAt: "2026-12-18T11:00:00Z" }]);
  assert.equal(previous.querySelector("[data-activity-check-in] time").textContent, "18/12/2026, 12:00");
});

test("Rome summer time and daylight-saving fallback use the right local instants", () => {
  const summer = render([activity("summer", { startsAt: "2027-08-01T08:30:00Z", endsAt: "2027-08-01T10:30:00Z", checkInStartsAt: "2027-08-01T08:00:00Z" })], "en", "2027-08-01T08:30:00Z");
  assert.equal(summer.querySelector("[data-activity-check-in] time").textContent, "10:00");
  assert.deepEqual([...summer.querySelectorAll("[data-activity-time] time")].map(time => time.textContent), ["10:30", "12:30"]);
  const autumn = render([activity("autumn", { startsAt: "2026-10-25T01:30:00Z", checkInStartsAt: "2026-10-25T00:15:00Z" })], "de", "2026-10-25T01:30:00Z");
  assert.equal(autumn.querySelector("[data-activity-check-in] time").textContent, "02:15");
  assert.equal(autumn.querySelector("[data-activity-time] time").textContent, "02:30");
});

test("a scheduled optional dinner appears once, while menu choices and package data are never rendered", () => {
  const dinner = activity("dinner", { name: "Cena", kind: "dinner", startsAt: "2026-12-19T19:00:00Z", menuOptions: ["MENU-PRIVATE"], packageName: "NOT-ACTIVITY" });
  const document = render([workshop, masterclass, dinner]);
  assert.equal(document.querySelectorAll("[data-activity-id=dinner]").length, 1);
  assert.ok(document.querySelector("[data-activity-id=dinner]").textContent.includes("20:00"));
  assert.doesNotMatch(document.textContent, /MENU-PRIVATE|NOT-ACTIVITY/);
});

test("long names remain complete and layout can stack or wrap without fixed-width text", () => {
  const longName = "Workshop " + "MovimentoConsapevole".repeat(12);
  const document = render([{ ...workshop, name: longName }]);
  const grid = document.querySelector("ul");
  assert.ok(grid.className.includes("sm:grid-cols-2"));
  const heading = document.querySelector("h3");
  assert.equal(heading.textContent, longName);
  assert.ok(heading.className.includes("break-words"));
  assert.ok(document.querySelector("[data-activity-time]").className.includes("flex-wrap"));
  assert.equal(document.querySelectorAll("button,a").length, 0, "the agenda cannot be mistaken for ticket choices");
});

test("unknown locales use Italian labels without changing the time or opening a translation gap", () => {
  const document = render([workshop], "fr");
  assert.ok(document.textContent.includes(copies.it.title));
  assert.ok(document.textContent.includes(copies.it.checkIn));
  assert.equal(document.querySelector("[data-activity-check-in] time").textContent, "12:00");
});
