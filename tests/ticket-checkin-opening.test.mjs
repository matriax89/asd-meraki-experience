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
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : require(name), process: { env: {} }, URL, Buffer, console });
  return compiledModule.exports;
}
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
async function renderTicket(locale, { commerce = false, opening = true, used = false } = {}) {
  const selected = [], filters = [];
  let registered;
  const details = { ...event, check_in_starts_at: opening ? event.check_in_starts_at : null };
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
    "@/lib/i18n-utils": i18n, "./config": { parseCommerceConfig: () => null }, "@/lib/tickets/wallet": wallet,
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
