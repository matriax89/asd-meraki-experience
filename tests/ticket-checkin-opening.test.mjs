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
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : name === "@/lib/events/travel-link" ? travel : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : name === "@/lib/events/affiliates" ? load("src/lib/events/affiliates.ts") : require(name), process: { env: {} }, URL, Buffer, console });
  return compiledModule.exports;
}
const logistics = load("src/lib/events/logistics.ts");
const travel = load("src/lib/events/travel-link.ts", { "@/lib/events/logistics": logistics });
const id = "79bb5f6a-2f35-40d6-9ad5-1d54dc109076";
const token = "private-fixture-ticket-token";
const event = { titolo: { it: "Meraki prova", en: "Meraki test", de: "Meraki Test", es: "Meraki prueba" }, data_inizio: "2026-11-18T23:30:00Z", check_in_starts_at: "2026-11-18T22:00:00Z", location: "Bolzano", indirizzo: null };
const copy = load("src/lib/tickets/view-copy.ts").ticketViewCopy;
const i18n = load("src/lib/i18n-utils.ts");
function value(document, label) {
  const term = [...document.querySelectorAll("dt")].find((element) => element.textContent === label);
  assert.ok(term, `Missing ticket detail: ${label}`);
  return term.nextElementSibling.textContent;
}
async function renderTicket(locale, { commerce = false, opening = true, used = false, guide = false } = {}) {
  const selected = [], filters = [];
  let registered;
  const information = logistics.emptyEventLogistics(); information.accessibility.it = "Ingresso accessibile";
  const details = { ...event, check_in_starts_at: opening ? event.check_in_starts_at : null, ...(guide ? { slug: "esperienza-meraki", tipo: "evento", attivo: true, logistics: information } : {}) };
  const query = { select(fields) { selected.push(fields); return this; }, eq(...args) { filters.push(args); return this; }, single: async () => ({ data: commerce ? null : { id, qr_code: token, buyer_nome: "Ada", buyer_cognome: "Prova", status: used ? "used" : "paid", used_at: used ? "2026-11-18T22:20:00Z" : null, event: details } }) };
  const page = load("src/app/[locale]/(public)/biglietto/[id]/page.tsx", {
    "@/lib/supabase/server": { createAdminClient: () => ({ from: () => query }) },
    "@/lib/i18n-utils": i18n,
    "@/lib/tickets/view-copy": { ticketViewCopy: copy },
    "@/lib/commerce/server": { getCommercePass: async () => commerce ? { pass: { id, qr_code: token, status: "paid", buyer_nome: "Ada", buyer_cognome: "Prova", package_name: "Workshop + Masterclass" }, event: details, config: null, entitlements: [{ activity_id: "ws", activity_name: "Workshop", status: "used", used_at: "2026-11-18T22:20:00Z" }, { activity_id: "mc", activity_name: "Masterclass", status: "available", used_at: null }] } : null },
    "@/components/meraki/register-ticket": { RegisterTicket: ({ ticket }) => { registered = ticket; return null; } },
    "@/components/meraki/commerce-purchase": { CommercePurchase: () => null },
    "@/i18n/routing": { Link: ({ children, ...props }) => createElement("a", props, children) },
    "next/image": { __esModule: true, default: (props) => { const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps); } },
    "next/navigation": { notFound() { throw Error("not found"); } },
    qrcode: { toDataURL: async () => "data:image/png;base64,cXItc3ludGhldGlj" },
  });
  const rendered = await page.default({ params: Promise.resolve({ id, locale }), searchParams: Promise.resolve({ token }) });
  const dom = new JSDOM(renderToStaticMarkup(rendered));
  return { dom, registered, selected, filters };
}

test("ticket pages distinguish opening, event start and a recorded admission using Italian dates in every language", async () => {
  for (const locale of ["it", "en", "de", "es"]) {
    const { dom, registered, selected, filters } = await renderTicket(locale, { used: true });
    const { document } = dom.window;
    assert.equal(value(document, copy[locale].when), "19 novembre 2026 alle ore 00:30");
    assert.equal(value(document, copy[locale].checkInOpens), "18 novembre 2026 alle ore 23:00");
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
  assert.equal(value(document, copy.en.checkInOpens), "18 novembre 2026 alle ore 23:00");
  assert.ok(document.querySelector("#ticket-accesses").parentElement.textContent.includes("Admission recorded: 18/11/26, 23:20"));
  assert.equal(registered.checkInStartsAt, event.check_in_starts_at);
  assert.equal(registered.status, "paid");
  dom.window.close();
});

test("older tickets without an opening schedule remain complete and do not invent one", async () => {
  const { dom, registered } = await renderTicket("es", { opening: false });
  assert.equal([...dom.window.document.querySelectorAll("dt")].some((term) => term.textContent === copy.es.checkInOpens), false);
  assert.equal(value(dom.window.document, copy.es.when), "19 novembre 2026 alle ore 00:30");
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

test("commerce pass loading and verified wallet refresh preserve the actual event opening", async () => {
  const selected = [];
  const pass = { id, qr_code: token, event_id: "event-fixture", status: "paid", first_name: "Ada", last_name: "Prova" };
  const db = { from(table) {
    return {
      select(fields) { selected.push([table, fields]); return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
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
  assert.ok(selected.some(([table, fields]) => table === "commerce_passes" && fields.includes("event:events(titolo,data_inizio,location,indirizzo,check_in_starts_at)")));
});

test("ticket translations use each paid admission snapshot even after catalogue names change", async () => {
  const localization = load("src/lib/commerce/localization.ts");
  const original = { packages: [{ id: "bundle", name: "Formula originale", nameTranslations: { en: "Original package" }, prices: [] }], activities: [{ id: "ws", name: "Workshop originale", nameTranslations: { en: "Original workshop" }, menuTranslations: {} }] };
  const upgraded = { packages: [{ id: "bundle", name: "Formula con cena", nameTranslations: { en: "Package with dinner" }, prices: [] }], activities: [{ id: "dinner", name: "Cena originale", nameTranslations: { en: "Original dinner" }, menuTranslations: { Vegetariano: { en: "Vegetarian dinner" } } }] };
  const current = { packages: [{ id: "bundle", name: "Formula rinominata", nameTranslations: { en: "Renamed package" }, prices: [] }], activities: [{ id: "ws", name: "Workshop rinominato", nameTranslations: { en: "Renamed workshop" } }, { id: "dinner", name: "Cena rinominata", nameTranslations: { en: "Renamed dinner" } }] };
  const pass = { id, qr_code: token, event_id: "event", order_id: "original-order", package_id: "bundle", package_name: "Formula con cena", status: "paid", first_name: "Ada", last_name: "Prova" };
  const rights = [{ order_id: "original-order", activity_id: "ws", activity_name: "Workshop originale", menu_choice: null, status: "valid" }, { order_id: "upgrade-order", activity_id: "dinner", activity_name: "Cena originale", menu_choice: "Vegetariano", status: "valid" }];
  const orders = [{ id: "upgrade-order", state: "fulfilled", upgrade_pass_id: id, event_snapshot: { commerce_config: upgraded } }, { id: "original-order", state: "fulfilled", upgrade_pass_id: null, event_snapshot: { commerce_config: original } }];
  const filters = [];
  const db = { from(table) { return {
    select() { return this; }, eq(key, value) { filters.push([table, key, value]); return this; }, in() { return this; }, order() { return this; },
    maybeSingle: async () => ({ data: pass }), single: async () => ({ data: { ...event, commerce_config: current } }),
    then(resolve) { return resolve({ data: table === "commerce_orders" ? orders : rights, error: null }); },
  }; } };
  const server = load("src/lib/commerce/server.ts", { "@supabase/supabase-js": { createClient: () => db }, "@/lib/i18n-utils": i18n, "./config": { parseCommerceConfig: (value) => value || null }, "./localization": localization, "@/lib/tickets/wallet": {} });
  const ticket = await server.getCommercePass(id, token, "en");
  assert.equal(ticket.pass.package_name, "Package with dinner");
  assert.equal(ticket.entitlements[0].activity_name, "Original workshop");
  assert.equal(ticket.entitlements[1].activity_name, "Original dinner");
  assert.equal(ticket.entitlements[1].menu_choice, "Vegetarian dinner");
  assert.ok(filters.some(([table, key, value]) => table === "commerce_passes" && key === "qr_code" && value === token));
  assert.equal(localization.commerceActivityName(original, "ws", "legacy", "de"), "Workshop originale");
  assert.equal(localization.commerceMenuName(upgraded, "dinner", "Vegetariano", "es"), "Vegetariano");
});
