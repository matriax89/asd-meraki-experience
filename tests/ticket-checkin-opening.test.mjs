import { dateFormatModule } from "./helpers/date-format-modules.mjs";
import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : name === "@/lib/events/travel-link" ? travel : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : name === "@/lib/events/affiliates" ? load("src/lib/events/affiliates.ts") : name === "@/lib/events/activity-timing" ? load("src/lib/events/activity-timing.ts") : name === "@/lib/events/date-format" ? dateFormatModule : require(name), process: { env: {} }, URL, Buffer, console });
  return compiledModule.exports;
}
const logistics = load("src/lib/events/logistics.ts");
const travel = load("src/lib/events/travel-link.ts", { "@/lib/events/logistics": logistics });
const id = "79bb5f6a-2f35-40d6-9ad5-1d54dc109076";
const token = "private-fixture-ticket-token";
const event = { titolo: { it: "Meraki prova", en: "Meraki test", de: "Meraki Test", es: "Meraki prueba" }, data_inizio: "2026-11-18T23:30:00Z", check_in_starts_at: "2026-11-18T22:00:00Z", location: "Bolzano", indirizzo: null };
const copy = load("src/lib/tickets/view-copy.ts").ticketViewCopy;
const cancellationCopy = load("src/lib/events/cancellation-copy.ts");
const i18n = load("src/lib/i18n-utils.ts");
function value(document, label) {
  const term = [...document.querySelectorAll("dt")].find((element) => element.textContent === label);
  assert.ok(term, `Missing ticket detail: ${label}`);
  return term.nextElementSibling.textContent;
}
async function renderTicket(locale, { commerce = false, opening = true, used = false, guide = false, canceled = false, unpublished = false, upgrades = false, refunded = false, rightsOverride, packageName = "Workshop + Masterclass" } = {}) {
  const selected = [], filters = [];
  let qrCalls = 0, purchaseCalls = 0;
  let registered;
  const information = logistics.emptyEventLogistics(); information.accessibility.it = "Ingresso accessibile";
  const details = { ...event, check_in_starts_at: opening ? event.check_in_starts_at : null, ...(guide ? { slug: "esperienza-meraki", tipo: "evento", attivo: true, logistics: information } : {}), ...(canceled ? { canceled_at: "2026-10-21T10:00:00Z", cancellation_reason: "Cambio programma <annullato>", attivo: false } : unpublished ? { attivo: false } : {}) };
  const query = { select(fields) { selected.push(fields); return this; }, eq(...args) { filters.push(args); return this; }, single: async () => ({ data: commerce ? null : { id, qr_code: token, buyer_nome: "Ada", buyer_cognome: "Prova", status: used ? "used" : "paid", used_at: used ? "2026-11-18T22:20:00Z" : null, event: details } }) };
  const page = load("src/app/[locale]/(public)/biglietto/[id]/page.tsx", {
    "@/lib/supabase/server": { createAdminClient: () => ({ from: () => query }) },
    "@/lib/i18n-utils": i18n,
    "@/lib/tickets/view-copy": { ticketViewCopy: copy },
    "@/lib/events/cancellation-copy": cancellationCopy,
    "@/lib/commerce/server": { getCommercePass: async () => commerce ? { pass: { id, qr_code: token, status: "paid", buyer_nome: "Ada", buyer_cognome: "Prova", package_name: packageName }, event: details, upgradesAllowed: !canceled && !refunded, config: upgrades ? { upgradesEnabled: true } : null, entitlements: rightsOverride || [{ activity_id: "ws", activity_name: "Workshop", status: "used", used_at: "2026-11-18T22:20:00Z" }, { activity_id: "mc", activity_name: "Masterclass", status: "available", used_at: null }] } : null },
    "@/components/meraki/register-ticket": { RegisterTicket: ({ ticket }) => { registered = ticket; return null; } },
    "@/components/meraki/commerce-purchase": { CommercePurchase: () => { purchaseCalls++; return null; } },
    "@/i18n/routing": { Link: ({ children, ...props }) => createElement("a", props, children) },
    "next/image": { __esModule: true, default: (props) => { const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps); } },
    "next/navigation": { notFound() { throw Error("not found"); } },
    qrcode: { toDataURL: async () => { qrCalls++; return "data:image/png;base64,cXItc3ludGhldGlj"; } },
  });
  const rendered = await page.default({ params: Promise.resolve({ id, locale }), searchParams: Promise.resolve({ token }) });
  const dom = new JSDOM(renderToStaticMarkup(rendered));
  return { dom, registered, selected, filters, qrCalls, purchaseCalls };
}

const ticketDates = {
  it: { start: "19 novembre 2026 alle ore 00:30", opening: "18 novembre 2026 alle ore 23:00", date: "19 novembre 2026" },
  en: { start: "19 November 2026 at 00:30", opening: "18 November 2026 at 23:00", date: "19 November 2026" },
  de: { start: "19. November 2026 um 00:30", opening: "18. November 2026 um 23:00", date: "19. November 2026" },
  es: { start: "19 de noviembre de 2026 a las 00:30", opening: "18 de noviembre de 2026 a las 23:00", date: "19 de noviembre de 2026" },
};

test("ticket pages translate calendar words while distinguishing opening, event start and a recorded admission in Italian time", async () => {
  for (const locale of ["it", "en", "de", "es"]) {
    const { dom, registered, selected, filters } = await renderTicket(locale, { used: true });
    const { document } = dom.window;
    assert.equal(value(document, copy[locale].when), ticketDates[locale].start);
    assert.equal(value(document, copy[locale].checkInOpens), ticketDates[locale].opening);
    assert.equal(value(document, copy[locale].checkedIn), "18/11/26, 23:20");
    assert.equal(registered.checkInStartsAt, event.check_in_starts_at);
    assert.equal(registered.status, "used");
    assert.ok(selected[0].includes("check_in_starts_at"));
    assert.deepEqual(filters, [["id", id], ["qr_code", token]]);
    dom.window.close();
  }
});

test("commerce tickets retain the opening schedule and label each already recorded activity separately", async () => {
  const { dom, registered } = await renderTicket("en", { commerce: true });
  const { document } = dom.window;
  assert.equal(value(document, copy.en.checkInOpens), ticketDates.en.opening);
  assert.ok(document.querySelector("#ticket-accesses").parentElement.textContent.includes("Admission recorded: 18/11/26, 23:20"));
  assert.equal(registered.checkInStartsAt, event.check_in_starts_at);
  assert.equal(registered.status, "paid");
  dom.window.close();
});

test("Masterclass-only tickets show its own check-in and schedule in all languages without the general event times", async () => {
  const timing = load("src/lib/events/activity-timing.ts");
  const masterclass = { activity_id: "mc", activity_name: "Masterclass", status: "available", used_at: null, checkInStartsAt: "2026-11-19T15:00:00Z", startsAt: "2026-11-19T15:30:00Z", endsAt: "2026-11-19T17:00:00Z" };
  for (const locale of ["it", "en", "de", "es"]) {
    const { dom } = await renderTicket(locale, { commerce: true, rightsOverride: [masterclass], packageName: "Masterclass" });
    const { document } = dom.window;
    const labels = timing.activityTimingCopy(locale);
    assert.equal(value(document, labels.checkIn), "19/11/2026, 16:00");
    assert.equal(value(document, labels.start), "19/11/2026, 16:30");
    assert.equal(value(document, labels.end), "19/11/2026, 18:00");
    assert.equal(value(document, labels.date), ticketDates[locale].date);
    assert.ok(document.body.textContent.includes(labels.timezone));
    assert.equal(document.querySelectorAll("#ticket-accesses + ul").length, 1);
    assert.equal(document.body.textContent.includes("00:30"), false);
    assert.equal(document.body.textContent.includes("23:00"), false);
    assert.equal(document.body.textContent.includes("Workshop"), false);
    assert.deepEqual([...document.querySelectorAll("time")].map(element => element.dateTime), [masterclass.checkInStartsAt, masterclass.startsAt, masterclass.endsAt]);
    dom.window.close();
  }
});

test("older tickets without an opening schedule remain complete and do not invent one", async () => {
  const { dom, registered } = await renderTicket("es", { opening: false });
  assert.equal([...dom.window.document.querySelectorAll("dt")].some((term) => term.textContent === copy.es.checkInOpens), false);
  assert.equal(value(dom.window.document, copy.es.when), ticketDates.es.start);
  assert.equal(registered.checkInStartsAt, undefined);
  assert.equal(registered.status, "paid");
  assert.ok(dom.window.document.querySelector('img[alt="Código QR personal para mostrar al personal en el control de acceso"]'));
  dom.window.close();
});

test("legacy and commerce tickets link to public trip information in every language without a bearer token", async () => {
  for (const commerce of [false, true]) for (const locale of ["it", "en", "de", "es"]) {
    const { dom } = await renderTicket(locale, { commerce, guide: true });
    const link = dom.window.document.querySelector('a[href$="#viaggio-soggiorno"]');
    assert.ok(link); assert.equal(link.textContent, travel.eventTravelCopy[locale].action);
    assert.equal(link.getAttribute("href"), `/${locale}/eventi/esperienza-meraki#viaggio-soggiorno`);
    assert.equal(link.getAttribute("href").includes(token), false);
    dom.window.close();
  }
});

test("explicit cancellation blocks ticket QR, manual code, downloads and upgrades before a refund succeeds", async () => {
  for (const commerce of [false, true]) for (const locale of ["it", "en", "de", "es"]) {
    const { dom, registered, qrCalls, purchaseCalls } = await renderTicket(locale, { commerce, canceled: true, guide: true, upgrades: true });
    const { document } = dom.window;
    const t = cancellationCopy.eventCancellationCopy(locale);
    assert.ok(document.body.textContent.includes(t.title));
    assert.ok(document.body.textContent.includes(t.ticketBody));
    assert.ok(document.body.textContent.includes("Cambio programma <annullato>"));
    assert.equal(document.querySelector('img[alt*="QR"]'), null);
    assert.equal(document.querySelector('a[download]'), null);
    assert.equal(document.querySelector('a[href$="#viaggio-soggiorno"]'), null);
    assert.equal(document.body.textContent.includes(token), false);
    assert.equal(document.body.textContent.includes(copy[locale].available), false);
    assert.equal(registered.status, "canceled");
    assert.equal(qrCalls, 0);
    assert.equal(purchaseCalls, 0);
    dom.window.close();
  }
});

test("ordinary unpublishing does not revoke a paid ticket or silently disable its QR", async () => {
  const { dom, registered, qrCalls, purchaseCalls } = await renderTicket("it", { commerce: true, unpublished: true, upgrades: true });
  assert.equal(registered.status, "paid");
  assert.equal(qrCalls, 1);
  assert.equal(purchaseCalls, 1);
  dom.window.close();
});

test("a confirmed monetary refund preserves valid QR admissions but hides upgrades based on outdated payment credit", async () => {
  const { dom, registered, qrCalls, purchaseCalls } = await renderTicket("it", { commerce: true, refunded: true, upgrades: true });
  assert.equal(registered.status, "paid");
  assert.equal(qrCalls, 1);
  assert.equal(purchaseCalls, 0);
  dom.window.close();
});

test("commerce pass loading and verified wallet refresh preserve the actual event opening", async () => {
  const selected = [];
  const pass = { id, qr_code: token, event_id: "event-fixture", status: "paid", first_name: "Ada", last_name: "Prova" };
  const db = { from(table) {
    return {
      select(fields) { selected.push([table, fields]); return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data: pass, error: null }),
      single: async () => ({ data: { ...event, commerce_config: null }, error: null }),
      then(resolve) { return resolve({ data: table === "commerce_passes" ? [{ ...pass, event }] : [{ pass_id: id, status: "valid", checked_in_at: null }], error: null }); },
    };
  } };
  const wallet = load("src/lib/tickets/wallet.ts");
  const server = load("src/lib/commerce/server.ts", {
    "@supabase/supabase-js": { createClient: () => db },
    "@/lib/i18n-utils": i18n, "./localization": load("src/lib/commerce/localization.ts"), "./config": { parseCommerceConfig: () => null }, "@/lib/tickets/wallet": wallet,
  });
  const verified = await server.getCommercePass(id, token);
  assert.equal(verified.event.check_in_starts_at, event.check_in_starts_at);
  const refreshed = await server.getCommerceWalletTickets([{ id, token }], "en");
  assert.equal(refreshed[0].checkInStartsAt, event.check_in_starts_at);
  assert.equal(refreshed[0].title, "Meraki test");
  assert.equal(refreshed[0].status, "paid");
  assert.ok(selected.some(([table, fields]) => table === "events" && fields.includes("check_in_starts_at")));
  assert.ok(selected.some(([table, fields]) => table === "commerce_passes" && fields.includes("event:events(titolo,data_inizio,location,indirizzo,check_in_starts_at,canceled_at)")));
});

test("ticket translations use each paid admission snapshot even after catalogue names change", async () => {
  const localization = load("src/lib/commerce/localization.ts");
  const original = { packages: [{ id: "bundle", name: "Formula originale", nameTranslations: { en: "Original package" }, prices: [] }], activities: [{ id: "ws", name: "Workshop originale", nameTranslations: { en: "Original workshop" }, menuTranslations: {} }] };
  const upgraded = { packages: [{ id: "bundle", name: "Formula con cena", nameTranslations: { en: "Package with dinner" }, prices: [] }], activities: [{ id: "dinner", name: "Cena originale", nameTranslations: { en: "Original dinner" }, menuTranslations: { Vegetariano: { en: "Vegetarian dinner" } } }] };
  const current = { packages: [{ id: "bundle", name: "Formula rinominata", nameTranslations: { en: "Renamed package" }, prices: [] }], activities: [{ id: "ws", name: "Workshop rinominato", nameTranslations: { en: "Renamed workshop" }, checkInStartsAt: "2026-12-19T11:00:00Z", startsAt: "2026-12-19T11:30:00Z", endsAt: "2026-12-19T14:30:00Z" }, { id: "dinner", name: "Cena rinominata", nameTranslations: { en: "Renamed dinner" } }] };
  const pass = { id, qr_code: token, event_id: "event", order_id: "original-order", package_id: "bundle", package_name: "Formula con cena", status: "paid", first_name: "Ada", last_name: "Prova" };
  const rights = [{ order_id: "original-order", activity_id: "ws", activity_name: "Workshop originale", menu_choice: null, status: "valid" }, { order_id: "upgrade-order", activity_id: "dinner", activity_name: "Cena originale", menu_choice: "Vegetariano", status: "valid" }];
  const orders = [{ id: "upgrade-order", state: "fulfilled", upgrade_pass_id: id, event_snapshot: { commerce_config: upgraded } }, { id: "original-order", state: "fulfilled", upgrade_pass_id: null, event_snapshot: { commerce_config: original } }];
  const filters = [];
  const db = { from(table) { return {
    select() { return this; }, eq(key, value) { filters.push([table, key, value]); return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
    maybeSingle: async () => ({ data: pass }), single: async () => ({ data: { ...event, commerce_config: current } }),
    then(resolve) { return resolve({ data: table === "commerce_orders" ? orders : rights, error: null }); },
  }; } };
  const server = load("src/lib/commerce/server.ts", { "@supabase/supabase-js": { createClient: () => db }, "@/lib/i18n-utils": i18n, "./config": { parseCommerceConfig: (value) => value || null }, "./localization": localization, "@/lib/tickets/wallet": {} });
  const ticket = await server.getCommercePass(id, token, "en");
  assert.equal(ticket.pass.package_name, "Package with dinner");
  assert.equal(ticket.entitlements[0].activity_name, "Original workshop");
  assert.equal(ticket.entitlements[1].activity_name, "Original dinner");
  assert.equal(ticket.entitlements[1].menu_choice, "Vegetarian dinner");
  assert.equal(ticket.entitlements[0].checkInStartsAt, current.activities[0].checkInStartsAt);
  assert.equal(ticket.entitlements[0].startsAt, current.activities[0].startsAt);
  assert.equal(ticket.entitlements[0].endsAt, current.activities[0].endsAt);
  assert.equal(ticket.entitlements[1].startsAt, undefined, "a dinner without confirmed times must not inherit workshop times");
  assert.ok(filters.some(([table, key, value]) => table === "commerce_passes" && key === "qr_code" && value === token));
  assert.equal(localization.commerceActivityName(original, "ws", "legacy", "de"), "Workshop originale");
  assert.equal(localization.commerceMenuName(upgraded, "dinner", "Vegetariano", "es"), "Vegetariano");
});
