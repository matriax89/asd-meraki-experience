import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { after } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { nativeFormControlMocks } from "./helpers/native-form-controls.mjs";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin?source=events", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, FormData: window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});
const Link = ({ children, prefetch: _prefetch, ...props }) => React.createElement("a", props, children);
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, URL, window, console, require: name => name in mocks ? mocks[name] : name in nativeFormControlMocks ? nativeFormControlMocks[name] : name === "@/lib/admin/analytics-csv" ? load("lib/admin/analytics-csv.ts") : require(name) });
  return module.exports;
}
const eventId = "43491c74-13c3-4747-8eaa-fbf9432c323e";
const eventB = "07836561-e1cc-4255-8a39-488edba0f433";
const affiliateId = "5c9d7464-cf07-4f55-beb7-73263ff474f8";
const metrics = { grossCents: 10000, refundedCents: 3000, netCents: 7000, feesCents: 250, netAfterFeesCents: 6750, missingFeePayments: 0, paidOrders: 3, validParticipants: 2, checkedInParticipants: 1, waiting: 4, pendingOrders: 1, expiredOrders: 2, failedOrders: 3 };
const summary = (grossCents, refundedCents, feesCents, count) => ({ grossCents, refundedCents, netCents: grossCents - refundedCents, feesCents, netAfterFeesCents: grossCents - refundedCents - feesCents, missingFeePayments: 0, count });
const summaries = () => ({ registrationSummary: summary(8000, 2000, 200, 2), dinnerSummary: summary(2000, 1000, 50, 1) });
const fixture = () => ({
  filters: { eventId, period: "30", from: "2026-09-23", to: "2026-10-22", affiliateId: "all" },
  events: [{ id: eventId, title: "Vibra", startsAt: "2026-12-19T11:30:00Z" }, { id: eventB, title: "Meraki Estate", startsAt: "2027-06-01T10:00:00Z" }],
  affiliateOptions: [{ id: affiliateId, name: "Scuola Meraki" }], metrics, ...summaries(),
  trend: [{ date: "2026-10-21", grossCents: 10000, refundedCents: 3000, netCents: 7000, feesCents: 250, netAfterFeesCents: 6750, missingFeePayments: 0, paidOrders: 3, ...summaries() }, { date: "2026-10-22", grossCents: 0, refundedCents: 0, netCents: 0, feesCents: 0, netAfterFeesCents: 0, missingFeePayments: 0, paidOrders: 0, registrationSummary: summary(0, 0, 0, 0), dinnerSummary: summary(0, 0, 0, 0) }],
  revenue: [
    { id: "masterclass", name: "Masterclass", grossCents: 4000, refundedCents: 1000, netCents: 3000, feesCents: 100, netAfterFeesCents: 2900, missingFeePayments: 0 },
    { id: "workshop", name: "Workshop", grossCents: 4000, refundedCents: 1000, netCents: 3000, feesCents: 100, netAfterFeesCents: 2900, missingFeePayments: 0 },
    { id: "dinner", name: "Cena", grossCents: 2000, refundedCents: 1000, netCents: 1000, feesCents: 50, netAfterFeesCents: 950, missingFeePayments: 0 },
  ],
  packages: [{ id: "combo", name: "Workshop + Masterclass", count: 2, netCents: 7000 }], tiers: [], addons: [],
  activities: [{ id: "ws", eventId, eventTitle: "Vibra", name: "Workshop", capacity: 100, validAdmissions: 20, checkedIn: 7, remaining: 80, occupied: 20, reservedAdmissions: 0, availableForSale: 80 }],
  affiliates: [{ id: affiliateId, eventId, eventTitle: "Vibra", name: "Scuola Meraki", validParticipants: 2, checkedInParticipants: 1, paidOrders: 3, grossCents: 10000, refundedCents: 3000, netCents: 7000, feesCents: 250, netAfterFeesCents: 6750, missingFeePayments: 0, commissionType: "eur", commissionPerParticipantCents: 500, commissionCents: 1000, commissionPerParticipantCredits: 0, commissionCredits: 0, ...summaries() }],
  eventStats: [{ id: eventId, title: "Vibra", startsAt: "2026-12-19T11:30:00Z", endsAt: null, status: "upcoming", capacity: 100, remaining: 80, ...metrics, ...summaries() }, { id: eventB, title: "Meraki Estate", startsAt: "2027-06-01T10:00:00Z", endsAt: null, status: "draft", capacity: null, remaining: null, ...metrics, ...summaries() }],
  attendanceGroups: [{ eventId, eventTitle: "Vibra", currentParticipants: 20, workshopOnly: 20, masterclassOnly: 0, both: 0, otherParticipants: 0, capacity: 100, remaining: 80, reservedParticipants: 0 }],
  operations: { newLeads: 5, openShopOrders: 2, confirmedContacts: 31 },
  notes: ["La disponibilità usa l’occupazione attuale."],
});
async function mount(context, { data = fixture(), fixedEventId, list = false, url = "/it/admin?source=events" } = {}) {
  window.history.replaceState(null, "", url);
  window.document.body.innerHTML = '<div id="root"></div>';
  const navigation = [];
  const mocks = { "next/navigation": { useRouter: () => ({ replace: (...args) => navigation.push(args) }) }, "@/i18n/routing": { Link } };
  const component = list ? load("app/[locale]/admin/eventi/events-list-client.tsx", mocks).EventsListClient : load("components/admin/analytics-dashboard.tsx", mocks).AnalyticsDashboard;
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(component, list ? { events: data.eventStats } : { data, fixedEventId })));
  context.after(async () => { await act(async () => root.unmount()); });
  const fill = async (id, value) => {
    const element = window.document.getElementById(id); assert.ok(element, id);
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new window.Event("input", { bubbles: true })); });
  };
  const select = async (id, value) => {
    const element = window.document.getElementById(id); assert.ok(element, id);
    await act(async () => { element.value = value; element.dispatchEvent(new window.Event("change", { bubbles: true })); });
  };
  const submit = async () => { await act(async () => window.document.querySelector('form[aria-label="Filtri statistiche"]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); };
  return { navigation, fill, select, submit };
}
const metric = (label, scope = window.document) => [...scope.querySelectorAll("dt")].find(node => node.textContent === label)?.nextElementSibling?.textContent.replaceAll("\u00a0", " ");
const csvRows = csv => csv.split("\r\n").map(line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"')));

test("main registrations exclude dinner and upgrades while dinner finances and accounting receipts remain separate", async context => {
  const data = fixture();
  data.registrationSummary = summary(153500, 3000, 3740, 26);
  data.dinnerSummary = summary(18000, 0, 441, 9);
  data.metrics = { ...data.metrics, grossCents: 171500, refundedCents: 3000, netCents: 168500, feesCents: 4181, netAfterFeesCents: 164319, paidOrders: 28, validParticipants: 26, checkedInParticipants: 0, waiting: 0 };
  data.trend = [{ date: "2026-10-21", ...data.metrics, registrationSummary: { ...data.registrationSummary }, dinnerSummary: { ...data.dinnerSummary } }];
  data.affiliates = [{ ...data.affiliates[0], ...data.metrics, registrationSummary: { ...data.registrationSummary }, dinnerSummary: { ...data.dinnerSummary } }];
  data.eventStats = [{ ...data.eventStats[0], ...data.metrics, registrationSummary: { ...data.registrationSummary }, dinnerSummary: { ...data.dinnerSummary } }];
  await mount(context, { data });
  const activities = window.document.querySelector('[aria-labelledby="analytics-registration-summary"]');
  const dinner = window.document.querySelector('[aria-labelledby="analytics-dinner-summary"]');
  assert.equal(window.document.getElementById("analytics-registration-summary").textContent, "Iscrizioni e incassi delle attività");
  assert.equal(metric("Iscritti validi", activities), "26");
  assert.equal(metric("Vendite lorde", activities), "1535,00 €");
  assert.equal(metric("Rimborsi", activities), "30,00 €");
  assert.equal(metric("Commissioni Stripe / PayPal", activities), "37,40 €");
  assert.equal(metric("Incassi netti", activities), "1467,60 €");
  assert.equal(metric("Ordini pagati", activities), undefined);
  assert.equal(metric("Pagamenti ricevuti", activities), undefined);
  assert.equal([...activities.querySelectorAll("dd")].some(node => node.textContent === "28"), false);
  assert.equal(metric("Cene prenotate", dinner), "9");
  assert.ok(dinner.textContent.replaceAll("\u00a0", " ").includes("180,00 €"));
  assert.ok(dinner.textContent.replaceAll("\u00a0", " ").includes("4,41 €"));
  assert.ok(dinner.textContent.replaceAll("\u00a0", " ").includes("175,59 €"));
  const accounting = [...window.document.querySelectorAll("details")].find(node => node.textContent.includes("Pagamenti ricevuti"));
  assert.ok(accounting); assert.equal(accounting.open, false); assert.ok(accounting.textContent.includes("28"));
  const row = window.document.querySelector('[aria-labelledby="sales-trend-title"] tbody tr');
  assert.deepEqual([...row.cells].map(cell => cell.textContent.replaceAll("\u00a0", " ")), ["21/10/2026", "1535,00 €", "30,00 €", "37,40 €", "1467,60 €", "26"]);
  const affiliate = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"] tbody tr');
  assert.deepEqual([...affiliate.cells].slice(1, 6).map(cell => cell.textContent.replaceAll("\u00a0", " ")), ["26", "9", "0", "1467,60 €", "175,59 €"]);
  const events = [...window.document.querySelectorAll("section")].find(node => node.querySelector("h2")?.textContent === "Riepilogo per evento");
  assert.ok(events.textContent.replaceAll("\u00a0", " ").includes("1467,60 €"));
  assert.ok(events.textContent.replaceAll("\u00a0", " ").includes("175,59 €"));
  assert.ok([...events.querySelectorAll("strong")].some(node => node.textContent === "26"));
  assert.ok([...events.querySelectorAll("strong")].some(node => node.textContent === "9"));
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  const rows = csvRows(csv);
  const historicalStart = rows.findIndex(entry => entry[0] === "Storico contabile complessivo · attività e cena");
  assert.ok(historicalStart > 0);
  const activeRows = rows.slice(0, historicalStart);
  for (const [label, value] of [["Iscritti validi", "26"], ["Cene prenotate", "9"], ["Lordo (€)", "1535"], ["Rimborsi riusciti (€)", "30"], ["Commissioni Stripe / PayPal note (€)", "37,4"], ["Netto dopo commissioni (€)", "1467,6"], ["Lordo cena (€)", "180"], ["Commissioni cena note (€)", "4,41"], ["Netto cena dopo commissioni (€)", "175,59"]]) {
    assert.equal(activeRows.find(entry => entry[0] === label)?.[1], value, label);
  }
  assert.equal(activeRows.some(entry => entry[0] === "Ordini pagati" || entry[0] === "Pagamenti ricevuti"), false);
  assert.ok(rows.slice(historicalStart).some(entry => entry.includes("28")));
});

test("dashboard uses real cohort metrics and exposes chart values in an accessible table", async context => {
  await mount(context);
  const registrations = window.document.querySelector('[aria-labelledby="analytics-registration-summary"]');
  const dinner = window.document.querySelector('[aria-labelledby="analytics-dinner-summary"]');
  assert.ok(registrations); assert.ok(dinner);
  assert.equal(metric("Vendite lorde", registrations), "80,00 €"); assert.equal(metric("Rimborsi", registrations), "20,00 €"); assert.equal(metric("Incassi netti", registrations), "58,00 €");
  assert.equal(metric("Commissioni Stripe / PayPal", registrations), "2,00 €");
  assert.equal(metric("Ordini pagati", registrations), undefined);
  assert.equal(metric("Iscritti validi", registrations), "2"); assert.equal(metric("Con check-in", registrations), "1");
  assert.equal(metric("Cene prenotate", dinner), "1");
  assert.ok(window.document.body.textContent.includes("Acquisti creati nel periodo selezionato"));
  assert.ok(window.document.body.textContent.includes("anche se eseguiti successivamente"));
  assert.ok(window.document.querySelector('svg[role="img"]'));
  const table = window.document.querySelector('[aria-labelledby="sales-trend-title"] table');
  assert.equal(table.tBodies[0].rows.length, 2);
  assert.ok(table.textContent.includes("21/10/2026"));
  assert.ok(window.document.body.textContent.includes("80 posti liberi nella sessione"));
  assert.ok(window.document.body.textContent.includes("indipendentemente dai filtri del report"));
  assert.equal(window.document.querySelector("video,canvas"), null);
  const explanation = [...window.document.querySelectorAll("details")].find(details => details.querySelector("summary")?.textContent === "Come leggere questi dati");
  assert.ok(explanation);
  assert.equal(explanation.open, false);
  assert.ok(explanation.textContent.includes(fixture().notes[0]));
});

test("current formulas show active people and net receipts with matching CSV semantics", async context => {
  const data = fixture();
  data.packages = [
    { id: "solo-mc", name: "Masterclass", count: 2, netCents: 7000 },
    { id: "combo", name: "Workshop + Masterclass", count: 21, netCents: 133000 },
  ];
  data.tiers = [{ id: "solo-mc:early", name: "Masterclass · Early Bird", count: 1, netCents: 3500 }];
  data.addons = [{ id: "dinner", name: "Cena", count: 1, netCents: 2000 }];
  await mount(context, { data });
  const section = title => [...window.document.querySelectorAll("section")].find(node => node.querySelector(":scope > h2")?.textContent === title);
  const formulas = section("Formule attive");
  assert.ok(formulas);
  assert.deepEqual([...formulas.querySelectorAll("li")].map(node => node.textContent.replaceAll("\u00a0", " ")), ["Masterclass70,00 €2 iscritti", "Workshop + Masterclass1330,00 €21 iscritti"]);
  assert.ok(formulas.textContent.includes("Ogni persona conta una sola volta nella formula attuale"));
  assert.ok(formulas.textContent.includes("Le iscrizioni interamente rimborsate sono escluse"));
  assert.ok(formulas.textContent.includes("al netto dei rimborsi e prima delle commissioni"));
  assert.ok(formulas.textContent.includes("Il periodo segue il primo acquisto"));
  assert.ok(section("Scaglioni delle formule attive").textContent.includes("1 iscritto"));
  assert.ok(section("Aggiunte attive").textContent.includes("1 accesso"));
  assert.equal(formulas.textContent.includes("vendite"), false);
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Formule attive"\r\n"Nome";"Iscritti";"Incassi al netto dei rimborsi (€)"\r\n"Masterclass";"2";"70"\r\n"Workshop + Masterclass";"21";"1330"'));
  assert.ok(csv.includes('"Aggiunte attive"\r\n"Nome";"Accessi";"Incassi al netto dei rimborsi (€)"\r\n"Cena";"1";"20"'));
  assert.ok(csv.includes("gli importi includono gli upgrade successivi"));
  assert.equal(csv.includes('"Nome";"Vendite";"Lordo (€)"'), false);
});


test("masterclass, workshop and dinner show separate gross, refund, fee and true net values", async context => {
  await mount(context);
  const section = window.document.querySelector('[aria-labelledby="analytics-revenue-title"]');
  assert.ok(section);
  assert.deepEqual([...section.querySelectorAll("h3")].map(node => node.textContent), ["Masterclass", "Workshop"]);
  assert.ok(section.compareDocumentPosition(window.document.querySelector('[aria-labelledby="sales-trend-title"]')) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  for (const [kind, expected] of [["masterclass", ["29,00 €", "40,00 €", "10,00 €", "1,00 €"]], ["workshop", ["29,00 €", "40,00 €", "10,00 €", "1,00 €"]]]) {
    const card = section.querySelector(`[data-revenue-kind="${kind}"]`);
    assert.deepEqual([card.querySelector("p").textContent, ...[...card.querySelectorAll("dd")].map(node => node.textContent)].map(value => value.replaceAll("\u00a0", " ")), expected);
  }
  const dinner = window.document.querySelector('[aria-labelledby="analytics-dinner-summary"]');
  assert.equal(metric("Vendite cena", dinner), "20,00 €"); assert.equal(metric("Rimborsi cena", dinner), "10,00 €");
  assert.equal(metric("Commissioni cena", dinner), "0,50 €"); assert.equal(metric("Incassi netti cena", dinner), "9,50 €");
  const trend = window.document.querySelector('[aria-labelledby="sales-trend-title"] table');
  assert.deepEqual([...trend.tBodies[0].rows[0].cells].map(cell => cell.textContent.replaceAll("\u00a0", " ")), ["21/10/2026", "80,00 €", "20,00 €", "2,00 €", "58,00 €", "2"]);
  assert.equal(trend.tHead.rows[0].cells[5].textContent, "Iscrizioni");
  assert.equal(window.document.getElementById("sales-trend-title").textContent, "Andamento delle attività · cena esclusa");
  const affiliates = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"]');
  assert.ok(affiliates.textContent.replaceAll("\u00a0", " ").includes("58,00 €"));
  assert.ok(affiliates.textContent.replaceAll("\u00a0", " ").includes("9,50 €"));
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(fixture());
  assert.ok(csv.includes('"Commissioni Stripe / PayPal note (€)";"2"'));
  assert.ok(csv.includes('"Netto dopo commissioni (€)";"58"'));
  assert.ok(csv.includes('"Netto cena dopo commissioni (€)";"9,5"'));
  assert.ok(csv.includes('"Masterclass";"40";"10";"30";"1";"29";"Complete"'));
  assert.ok(csv.includes('"Cena";"20";"10";"10";"0,5";"9,5";"Complete"'));
});

test("incomplete fees remain explicit in KPIs, categories, chart, affiliates, event totals and CSV", async context => {
  const data = fixture();
  const incomplete = row => ({ ...row, feesCents: 100, netAfterFeesCents: null, missingFeePayments: 1 });
  data.metrics = incomplete(data.metrics);
  data.registrationSummary = incomplete(data.registrationSummary);
  data.revenue[0] = incomplete(data.revenue[0]);
  data.trend[0] = { ...incomplete(data.trend[0]), registrationSummary: incomplete(data.trend[0].registrationSummary) };
  data.affiliates = data.affiliates.map(row => ({ ...incomplete(row), registrationSummary: incomplete(row.registrationSummary) }));
  data.eventStats = data.eventStats.map(row => ({ ...incomplete(row), registrationSummary: incomplete(row.registrationSummary) }));
  await mount(context, { data });
  assert.equal(metric("Incassi netti"), "Da verificare");
  assert.equal(metric("Commissioni Stripe / PayPal"), "1,00 € (parziali)");
  assert.ok(window.document.querySelector('[role="status"]').textContent.includes("Commissioni delle attività incomplete per 1 pagamento"));
  assert.equal(window.document.querySelector('[data-revenue-kind="masterclass"] > p').textContent, "Da verificare");
  assert.equal(window.document.querySelector('[data-revenue-kind="workshop"] > p').textContent.replaceAll("\u00a0", " "), "29,00 €");
  assert.equal(window.document.querySelector('svg[role="img"]'), null);
  assert.ok(window.document.body.textContent.includes("Il grafico del netto sarà disponibile quando le commissioni saranno complete"));
  const affiliate = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"] tbody tr');
  assert.equal(affiliate.cells[4].textContent, "Da verificare");
  const eventsSection = [...window.document.querySelectorAll("section")].find(section => section.querySelector("h2")?.textContent === "Riepilogo per evento");
  for (const event of eventsSection.querySelectorAll("li")) assert.equal(event.querySelector("strong").textContent, "Da verificare");
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Netto dopo commissioni (€)";"Da verificare"'));
  assert.ok(csv.includes('"Masterclass";"40";"10";"30";"1";"Da verificare";"Parziali: 1 pagamento da verificare"'));
  assert.equal(/NaN|undefined/.test(csv), false);
});

test("unavailable dinner fees do not hide verified activity receipts or the activity chart", async context => {
  const data = fixture();
  const unavailable = row => ({ ...row, feesCents: 20, netAfterFeesCents: null, missingFeePayments: 1 });
  data.dinnerSummary = unavailable(data.dinnerSummary);
  data.metrics = { ...data.metrics, feesCents: 220, netAfterFeesCents: null, missingFeePayments: 1 };
  data.affiliates[0].dinnerSummary = unavailable(data.affiliates[0].dinnerSummary);
  data.eventStats[0].dinnerSummary = unavailable(data.eventStats[0].dinnerSummary);
  await mount(context, { data });
  const registrations = window.document.querySelector('[aria-labelledby="analytics-registration-summary"]');
  const dinner = window.document.querySelector('[aria-labelledby="analytics-dinner-summary"]');
  assert.equal(metric("Incassi netti", registrations), "58,00 €");
  assert.equal(metric("Commissioni Stripe / PayPal", registrations), "2,00 €");
  assert.equal(metric("Incassi netti cena", dinner), "Da verificare");
  assert.equal(metric("Commissioni cena", dinner), "0,20 € (parziali)");
  assert.ok(window.document.querySelector('[aria-labelledby="sales-trend-title"] svg'));
  const affiliate = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"] tbody tr');
  assert.equal(affiliate.cells[4].textContent.replaceAll("\u00a0", " "), "58,00 €");
  assert.equal(affiliate.cells[5].textContent, "Da verificare");
  const exported = csvRows(load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data));
  assert.equal(exported.find(row => row[0] === "Netto dopo commissioni (€)")[1], "58");
  assert.equal(exported.find(row => row[0] === "Netto cena dopo commissioni (€)")[1], "Da verificare");
  assert.equal(exported.find(row => row[0] === "Stato commissioni")[1], "Complete");
  assert.equal(exported.find(row => row[0] === "Stato commissioni cena")[1], "Parziali: 1 pagamento da verificare");
});

test("retained processing fees after full refund remain a negative net", async context => {
  const data = fixture();
  data.metrics = { ...data.metrics, refundedCents: 10000, netCents: 0, netAfterFeesCents: -250 };
  data.registrationSummary = { ...data.registrationSummary, count: 0, refundedCents: 8000, netCents: 0, netAfterFeesCents: -200 };
  data.dinnerSummary = { ...data.dinnerSummary, count: 0, refundedCents: 2000, netCents: 0, netAfterFeesCents: -50 };
  await mount(context, { data });
  assert.equal(metric("Incassi netti"), "-2,00 €");
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Netto dopo commissioni (€)";"-2"'));
  assert.ok(csv.includes('"Netto cena dopo commissioni (€)";"-0,5"'));
  assert.ok(csvRows(csv).some(row => JSON.stringify(row) === JSON.stringify(["Totale attività e cena", "100", "100", "0", "2,5", "-2,5", "Complete"])));
});

test("affiliate waitlist remains unavailable rather than a fabricated zero and empty sales have no fake chart", async context => {
  const data = fixture(); data.metrics = { ...metrics, waiting: null }; data.trend = data.trend.map(row => ({ ...row, grossCents: 0, netCents: 0, refundedCents: 0, feesCents: 0, netAfterFeesCents: 0, missingFeePayments: 0, paidOrders: 0, registrationSummary: summary(0, 0, 0, 0), dinnerSummary: summary(0, 0, 0, 0) }));
  await mount(context, { data });
  assert.equal(metric("Lista d’attesa"), "—");
  assert.ok(window.document.body.textContent.includes("Non attribuibile a un affiliato"));
  assert.equal(window.document.querySelector('svg[role="img"]'), null);
  assert.ok(window.document.body.textContent.includes("Nessuna vendita confermata nel periodo selezionato."));
});

test("overview operational counters are explicit global links and are absent in event statistics", async context => {
  await mount(context);
  const operations = window.document.querySelector('[aria-labelledby="analytics-operations"]');
  assert.ok(operations.textContent.includes("Situazione attuale, indipendente dai filtri"));
  assert.deepEqual([...operations.querySelectorAll("strong")].map(node => node.textContent), ["5", "2", "31"]);
  assert.equal(operations.querySelector('a[href="/admin/leads"]').textContent, "Nuove richieste5");
  const fixed = load("components/admin/analytics-dashboard.tsx", { "next/navigation": { useRouter: () => ({ replace() {} }) }, "@/i18n/routing": { Link } }).AnalyticsDashboard;
  const html = renderToStaticMarkup(React.createElement(fixed, { data: fixture(), fixedEventId: eventId }));
  assert.equal(html.includes('id="analytics-operations"'), false);
});

test("aggregate CSV export keeps Italian values and neutralizes spreadsheet formulas in public names", () => {
  const data = fixture(); data.packages[0].name = '=HYPERLINK("https://example.test")'; data.affiliates[0].name = "\t+SUM(1;2)";
  data.participant_private_email = "private@example.test";
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data, false);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Rimborsi riusciti (€)";"20"'));
  assert.ok(csv.includes('"Rimborsi cena (€)";"10"'));
  assert.ok(csv.includes('"Criterio iscrizioni";"Ogni persona conta una sola volta nella formula attuale; gli upgrade aggiornano la stessa iscrizione'));
  assert.ok(csv.includes('"Criterio pagamenti";"Ogni pagamento di iscrizione, upgrade o cena conta una volta; esclusi ordini gratuiti e interamente rimborsati.'));
  assert.ok(csvRows(csv).some(row => JSON.stringify(row) === JSON.stringify(["Totale attività e cena", "100", "30", "70", "2,5", "67,5", "Complete"])));
  assert.ok(csv.includes('"Periodo";"23/09/2026";"22/10/2026"'));
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'\t+SUM"));
  assert.equal(csv.includes("private@example.test"), false);
  assert.equal(csv.includes("Riepilogo per evento"), false);
  assert.ok(csv.includes("disponibilità per capienza dopo prenotazioni e limite complessivo"));
  assert.ok(csv.includes('"Workshop";"100";"20";"7";"80"'));
});

test("custom Italian dates validate before navigation and become shareable ISO date parameters", async context => {
  const ui = await mount(context);
  await ui.select("analytics-period", "custom");
  await ui.fill("analytics-from", "31/02/2026"); await ui.fill("analytics-to", "22/10/2026"); await ui.submit();
  assert.equal(ui.navigation.length, 0); assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("gg/mm/aaaa"));
  await ui.fill("analytics-from", "23/10/2026"); await ui.submit();
  assert.equal(ui.navigation.length, 0); assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("successiva"));
  await ui.fill("analytics-from", "01/10/2026"); await ui.submit();
  const url = new URL(ui.navigation.at(-1)[0], window.location.origin);
  assert.equal(url.searchParams.get("from"), "2026-10-01"); assert.equal(url.searchParams.get("to"), "2026-10-22");
  assert.equal(url.searchParams.get("period"), "custom"); assert.equal(url.searchParams.get("source"), "events"); assert.equal(url.searchParams.get("event"), eventId);
});

test("direct purchases are selectable, preserved on navigation and identified correctly in the CSV", async context => {
  const data = fixture();
  const ui = await mount(context, { data });
  assert.equal(window.document.querySelector('#analytics-affiliate option[value="direct"]').textContent, "Acquisti diretti");
  await ui.select("analytics-affiliate", "direct");
  const url = new URL(ui.navigation.at(-1)[0], window.location.origin);
  assert.equal(url.searchParams.get("affiliate"), "direct");
  assert.equal(url.searchParams.get("event"), eventId);
  const filtered = { ...data, filters: { ...data.filters, affiliateId: "direct" } };
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(filtered);
  assert.ok(csv.includes('"Affiliato";"Acquisti diretti"'));
  assert.equal(csv.includes('"Affiliato";"Tutti gli affiliati e acquisti diretti"'), false);
});

test("the real custom affiliate select displays the DAL all value instead of its placeholder", () => {
  const controls = load("components/ui/custom-select.tsx", { "./custom-select.module.css": {} });
  const Dashboard = load("components/admin/analytics-dashboard.tsx", { "@/components/ui/custom-select": controls, "next/navigation": { useRouter: () => ({ replace() {} }) }, "@/i18n/routing": { Link } }).AnalyticsDashboard;
  const html = renderToStaticMarkup(React.createElement(Dashboard, { data: fixture() }));
  const parsed = new JSDOM(html);
  const nativeSelect = parsed.window.document.getElementById("analytics-affiliate-native");
  assert.equal(nativeSelect.value, "all");
  assert.ok([...nativeSelect.options].some(option => option.value === fixture().filters.affiliateId));
  const trigger = parsed.window.document.getElementById("analytics-affiliate");
  assert.ok(trigger.textContent.includes("Tutti gli affiliati e acquisti diretti"));
  assert.equal(trigger.textContent.includes("Seleziona"), false);
  parsed.window.close();
});

test("event changes reset affiliate attribution and period presets clear custom dates", async context => {
  const data = fixture(); data.filters = { ...data.filters, affiliateId, period: "custom" };
  const ui = await mount(context, { data });
  await ui.select("analytics-event", eventB);
  let url = new URL(ui.navigation.at(-1)[0], window.location.origin);
  assert.equal(url.searchParams.get("event"), eventB); assert.equal(url.searchParams.has("affiliate"), false);
  assert.equal(window.document.getElementById("analytics-affiliate").value, "all");
  await ui.select("analytics-period", "7");
  url = new URL(ui.navigation.at(-1)[0], window.location.origin);
  assert.equal(url.searchParams.get("period"), "7"); assert.equal(url.searchParams.has("from"), false); assert.equal(url.searchParams.has("to"), false);
});

test("event statistics keep the event fixed and all direct management links carry its scope", async context => {
  const ui = await mount(context, { fixedEventId: eventId, url: `/it/admin/eventi/${eventId}/statistiche?event=${eventB}` });
  assert.equal(window.document.getElementById("analytics-event").disabled, true);
  await ui.select("analytics-period", "90");
  const url = new URL(ui.navigation[0][0], window.location.origin);
  assert.equal(url.pathname, `/it/admin/eventi/${eventId}/statistiche`); assert.equal(url.searchParams.has("event"), false);
  const hrefs = [...window.document.querySelectorAll("a")].map(link => link.getAttribute("href"));
  for (const href of [`/admin/biglietti?event=${eventId}`, `/admin/affiliati?event=${eventId}`, `/admin/rimborsi?event=${eventId}`, `/admin/eventi/${eventId}/commerce`, `/admin/eventi/${eventId}`]) assert.ok(hrefs.includes(href), href);
});

test("event list searches and filters status while titles open statistics without entering edit", async context => {
  const ui = await mount(context, { list: true });
  assert.equal(window.document.querySelector('h2 a').getAttribute("href"), `/admin/eventi/${eventId}/statistiche`);
  const cardDetails = window.document.querySelector("h2").parentElement;
  assert.ok(cardDetails.classList.contains("w-full"));
  assert.ok(cardDetails.parentElement.classList.contains("flex-col"));
  assert.ok(cardDetails.parentElement.classList.contains("sm:flex-row"));
  assert.ok(cardDetails.nextElementSibling.classList.contains("text-left"));
  assert.ok(cardDetails.nextElementSibling.classList.contains("sm:text-right"));
  assert.equal(metric("Netto attività", cardDetails.nextElementSibling), "58,00 €");
  assert.equal(metric("Iscritti attività", cardDetails.nextElementSibling), "2");
  assert.equal(metric("Netto cena", cardDetails.nextElementSibling), "9,50 €");
  assert.equal(metric("Cene", cardDetails.nextElementSibling), "1");
  await ui.fill("events-search", "estate"); assert.equal(window.document.querySelectorAll("h2").length, 1); assert.equal(window.document.querySelector("h2").textContent, "Meraki Estate");
  await ui.select("events-status", "upcoming"); assert.equal(window.document.querySelectorAll("h2").length, 0); assert.ok(window.document.body.textContent.includes("Nessun evento corrisponde ai filtri."));
  await ui.fill("events-search", ""); assert.equal(window.document.querySelector("h2").textContent, "Vibra");
  const nav = window.document.querySelector('nav[aria-label="Gestisci Vibra"]');
  assert.equal(nav.querySelectorAll("a").length, 6);
  assert.ok(nav.textContent.includes("Statistiche")); assert.ok(nav.textContent.includes("Modifica evento"));
});

test("async analytics routes forward filters and the event detail cannot be overridden by a query event", async () => {
  const calls = [];
  const mocks = { "@/lib/admin/analytics": { loadAdminAnalytics: async input => { calls.push(input); return fixture(); } }, "@/components/admin/analytics-dashboard": { AnalyticsDashboard: ({ fixedEventId }) => React.createElement("p", null, fixedEventId || "dashboard") } };
  const dashboard = load("app/[locale]/admin/page.tsx", mocks).default;
  await dashboard({ params: Promise.resolve({ locale: "it" }), searchParams: Promise.resolve({ event: eventId, period: "custom", from: "2026-10-01", to: "2026-10-22", affiliate: affiliateId }) });
  assert.equal(calls[0].eventId, eventId); assert.equal(calls[0].affiliateId, affiliateId); assert.equal(calls[0].period, "custom");
  const detail = load("app/[locale]/admin/eventi/[id]/statistiche/page.tsx", mocks).default;
  const rendered = renderToStaticMarkup(await detail({ params: Promise.resolve({ locale: "de", id: eventId }), searchParams: Promise.resolve({ event: eventB, period: "7" }) }));
  assert.ok(rendered.includes(eventId)); assert.equal(calls[1].eventId, eventId); assert.equal(calls[1].locale, "de");
});

test("data errors remain explicit and do not turn missing financial data into zeros", async () => {
  const fail = async () => { throw new Error("private-provider-error"); };
  const mocks = { "@/lib/admin/analytics": { loadAdminAnalytics: fail }, "@/components/admin/analytics-dashboard": {}, "./events-list-client": {}, "next-intl/server": { getLocale: async () => "it" } };
  for (const path of ["app/[locale]/admin/page.tsx", "app/[locale]/admin/eventi/[id]/statistiche/page.tsx", "app/[locale]/admin/eventi/page.tsx"]) {
    const page = load(path, mocks).default;
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ locale: "it", id: eventId }), searchParams: Promise.resolve({}) }));
    assert.ok(html.includes('role="alert"')); assert.equal(html.includes("0,00"), false); assert.equal(html.includes("private-provider-error"), false);
  }
});


test("affiliate compensation uses valid people instead of orders and keeps direct purchases separate", async context => {
  const data = fixture();
  const paid = { ...data.affiliates[0], validParticipants: 8, paidOrders: 9, commissionPerParticipantCents: 500, commissionCents: 4000, registrationSummary: { ...data.affiliates[0].registrationSummary, count: 8 }, dinnerSummary: { ...data.affiliates[0].dinnerSummary, count: 2 } };
  const direct = { ...data.affiliates[0], id: "direct", name: "Acquisti diretti", validParticipants: 4, paidOrders: 4, commissionPerParticipantCents: 0, commissionCents: 0, registrationSummary: { ...data.affiliates[0].registrationSummary, count: 4 } };
  const noCommission = { ...data.affiliates[0], id: "no-commission", name: "Affiliato senza compenso", validParticipants: 1, paidOrders: 2, commissionPerParticipantCents: 0, commissionCents: 0, registrationSummary: { ...data.affiliates[0].registrationSummary, count: 1 }, dinnerSummary: { ...data.affiliates[0].dinnerSummary, count: 0 } };
  data.affiliates = [paid, direct, noCommission];
  await mount(context, { data, fixedEventId: eventId });
  const section = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"]');
  const rows = section.querySelectorAll("tbody tr");
  const normalized = row => [...row.cells].map(cell => cell.textContent.replaceAll("\u00a0", " "));
  assert.deepEqual(normalized(rows[0]).slice(1, 8), ["8", "2", "1", "58,00 €", "9,50 €", "5,00 €", "40,00 €"]);
  assert.deepEqual(normalized(rows[1]).slice(6, 8), ["—", "0,00 €"]);
  assert.deepEqual(normalized(rows[2]).slice(6, 8), ["0,00 €", "0,00 €"]);
  assert.ok(section.textContent.replaceAll("\u00a0", " ").includes("Totale compensi affiliati: 40,00 €"));
  assert.ok(section.textContent.includes("una sola volta per ogni iscritto valido"));
  assert.equal(section.querySelector('a').getAttribute("href"), `/admin/affiliati?event=${eventId}`);
  assert.equal(section.querySelector('a').textContent, "Gestisci compensi");
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Compensi affiliati maturati (€)";"40"'));
  assert.ok(csv.includes('"Compenso per iscritto (€)";"Compenso maturato (€)"'));
  const exported = csvRows(csv);
  const affiliated = exported.find(row => row[1] === "Scuola Meraki");
  const directPurchase = exported.find(row => row[1] === "Acquisti diretti");
  assert.ok(affiliated.includes("8")); assert.ok(affiliated.includes("2"));
  assert.ok(affiliated.includes("58")); assert.ok(affiliated.includes("9,5"));
  assert.deepEqual(affiliated.slice(-5), ["EUR", "5", "40", "0", "0"]);
  assert.deepEqual(directPurchase.slice(-5), ["Non applicabile", "Non applicabile", "0", "Non applicabile", "0"]);
  assert.ok(csv.includes('"Netto dopo commissioni (€)";"58"'), "affiliate compensation must not change activity processor net");
});

test("analytics and CSV display EUR and credits as separate compensation totals", async context => {
  const data = fixture();
  data.affiliates.push({ ...data.affiliates[0], id: "credit-affiliate", name: "Scuola a crediti", validParticipants: 3, commissionType: "credits", commissionPerParticipantCents: 0, commissionCents: 0, commissionPerParticipantCredits: 2, commissionCredits: 6, registrationSummary: { ...data.affiliates[0].registrationSummary, count: 3 } });
  await mount(context, { data });
  const section = window.document.querySelector('[aria-labelledby="analytics-affiliates-title"]');
  const row = section.querySelectorAll("tbody tr")[1];
  assert.equal(row.cells[4].textContent.replaceAll("\u00a0", " "), "58,00 €");
  assert.equal(row.cells[5].textContent.replaceAll("\u00a0", " "), "9,50 €");
  assert.equal(row.cells[6].textContent, "2 crediti"); assert.equal(row.cells[7].textContent, "6 crediti");
  assert.ok(section.textContent.replaceAll("\u00a0", " ").includes("Totale compensi affiliati: 10,00 € · 6 crediti"));
  assert.ok(section.textContent.includes("senza conversioni"));
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Compensi affiliati maturati (€)";"10"'));
  assert.ok(csv.includes('"Compensi affiliati maturati (crediti)";"6"'));
  assert.ok(csv.includes('"Unità compenso";"Compenso per iscritto (€)";"Compenso maturato (€)";"Compenso per iscritto (crediti)";"Compenso maturato (crediti)"'));
  const exported = csvRows(csv).find(entry => entry[1] === "Scuola a crediti");
  assert.ok(exported.includes("3")); assert.ok(exported.includes("58")); assert.ok(exported.includes("9,5"));
  assert.deepEqual(exported.slice(-5), ["Crediti", "0", "0", "2", "6"]);
  assert.ok(csv.includes('"Netto dopo commissioni (€)";"58"'));
});

test("capacity shows distinct people, session seats and a separate purchase limit", async context => {
  const data = fixture();
  data.activities = [
    { ...data.activities[0], validAdmissions: 4, checkedIn: 1, occupied: 11, remaining: 89, reservedAdmissions: 1, availableForSale: 86 },
    { ...data.activities[0], id: "mc", name: "Masterclass", validAdmissions: 5, checkedIn: 0, occupied: 13, remaining: 87, reservedAdmissions: 0, availableForSale: 86 },
  ];
  data.attendanceGroups = [{ eventId, eventTitle: "Vibra", currentParticipants: 13, workshopOnly: 0, masterclassOnly: 2, both: 11, otherParticipants: 0, capacity: 100, remaining: 87, reservedParticipants: 1 }];
  await mount(context, { data, fixedEventId: eventId });
  const section = window.document.querySelector('[aria-labelledby="analytics-availability-title"]');
  assert.ok(section.textContent.includes("89 posti liberi nella sessione"));
  assert.ok(section.textContent.includes("87 posti liberi nella sessione"));
  assert.ok(section.textContent.includes("11 posti occupati attualmente su 100"));
  assert.ok(section.textContent.includes("Nel periodo selezionato: 4 accessi validi · 1 check-in."));
  assert.ok(section.textContent.includes("1 posto temporaneamente prenotato"));
  assert.ok(section.textContent.includes("Disponibilità per capienza: 86"));
  const group = section.querySelector('[data-attendance-event]');
  assert.ok(group.textContent.includes("13 persone distinte attualmente iscritte"));
  assert.deepEqual([...group.querySelectorAll("dd")].map(node => node.textContent), ["0", "2", "11"]);
  assert.ok(group.textContent.includes("I due conteggi non vanno sommati"));
  assert.ok(group.textContent.includes("Limite complessivo dell’evento: 100 persone distinte"));
  const csv = load("lib/admin/analytics-csv.ts").adminAnalyticsCsv(data);
  assert.ok(csv.includes('"Vibra";"Workshop";"100";"4";"1";"89";"11";"1";"86"'));
  assert.ok(csv.includes('"Vibra";"13";"0";"2";"11";"0";"100";"87";"1"'));
});

test("activity capacity without a global event cap never invents a global sold-out limit", async context => {
  const data = fixture();
  data.attendanceGroups[0] = { ...data.attendanceGroups[0], capacity: null, remaining: null, workshopOnly: 0, masterclassOnly: 0, both: 0, otherParticipants: 20 };
  await mount(context, { data });
  const group = window.document.querySelector('[data-attendance-event]');
  assert.ok(group.textContent.includes("Altre attività"));
  assert.ok(group.textContent.includes("Nessun limite aggiuntivo sul totale delle persone dell’evento."));
  assert.equal(group.textContent.includes("Limite complessivo dell’evento:"), false);
  const section = window.document.querySelector('[aria-labelledby="analytics-availability-title"]');
  assert.equal(section.textContent.includes("Disponibilità per capienza:"), false, "session and purchasable seats agree without holds/global limit");
});
