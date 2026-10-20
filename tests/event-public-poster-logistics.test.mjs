import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, environment = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Date, Intl, URL, console, ...environment, require: (name) => name in mocks ? mocks[name] : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : require(name) });
  return compiledModule.exports;
}
const image = { __esModule: true, default: (props) => {
  const imageProps = { ...props }; delete imageProps.fill; delete imageProps.unoptimized;
  return React.createElement("img", imageProps);
} };
const link = { Link: ({ children, ...props }) => React.createElement("a", props, children) };
const logistics = load("lib/events/logistics.ts");
const poster = load("components/meraki/event-poster.tsx", { "next/image": image });
const travel = load("components/meraki/event-logistics-section.tsx", { "@/lib/events/logistics": logistics });
const model = load("components/meraki/event-model.ts");
const priceSummary = load("components/meraki/event-price-summary.tsx", { "./event-model": model, "./commerce-public-model": load("components/meraki/commerce-public-model.ts"), "@/lib/commerce/localization": load("lib/commerce/localization.ts") });
const card = load("components/meraki/event-card.tsx", { "./event-poster": poster, "./event-model": model, "./event-price-summary": priceSummary, "@/i18n/routing": link });
const detail = load("components/meraki/event-detail.tsx", {
  "./event-poster": poster, "./event-logistics-section": travel, "./event-model": model, "@/lib/events/logistics": logistics,
  "@/i18n/routing": link,
  "@/components/public/event-description": { EventDescription: ({ description }) => React.createElement("p", null, description) },
  "@/lib/tickets/event-availability": load("lib/tickets/event-availability.ts"),
  "@/app/[locale]/(public)/eventi/[slug]/checkout-button": { CheckoutButton: () => React.createElement("button", null, "Checkout") },
  "./commerce-purchase": { CommercePurchase: ({ fallback }) => fallback },
});
const event = { id: "test", slug: "meraki-test", type: "evento", title: "Meraki Workshop", subtitle: "Muoviti insieme", startsAt: "2027-11-21T17:00:00Z", endsAt: null, cover: "https://assets.example.test/original-poster.png", location: "Bolzano", address: "Via Meraki 1", price: 6000, capacity: 30, sold: 0, description: "Descrizione", ctaType: "stripe", ctaUrl: null };
const localized = (it, other = {}) => ({ it, en: "", de: "", es: "", ...other });
const data = {
  ...logistics.emptyEventLogistics(),
  accommodations: [{ id: "partner", kind: "partner", name: "Hotel Meraki", address: "Via Meraki 5", mapUrl: "https://maps.example.test/meraki", bookingUrl: "https://hotel.example.test/book", phone: "+39 0471 123456", email: "reception@example.test", distance: localized("A 500 metri"), rate: localized("Camera da 90 €", { en: "Room from €90", de: "Zimmer ab 90 €", es: "Habitación desde 90 €" }), benefits: localized("Colazione inclusa\nParcheggio gratuito"), bookingInstructions: localized("Indica MERAKI al telefono <b>codice</b>"), validUntil: "2027-11-20" }, { id: "suggested", kind: "suggested", name: "Casa Consigliata", address: "", mapUrl: "", bookingUrl: "", phone: "", email: "", distance: localized(""), rate: localized(""), benefits: localized(""), bookingInstructions: localized(""), validUntil: null }],
  arrivals: ["plane", "train", "bus", "car"].map((mode) => ({ id: mode, mode, title: localized(`Percorso ${mode}`, { en: `Route ${mode}`, de: `Anreise ${mode}`, es: `Ruta ${mode}` }), description: localized("Prima fermata\nSeconda fermata <script>alert(1)</script>"), linkUrl: `https://travel.example.test/${mode}` })),
  accessibility: localized("Ingresso senza gradini", { en: "Step-free entrance", de: "Stufenloser Eingang", es: "Entrada sin escalones" }),
  contact: localized("Per informazioni contatta Meraki."),
};
const render = (Component, props) => JSDOM.fragment(renderToStaticMarkup(React.createElement(Component, props)));

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale} detail and both card variants show the entire original 4:5 poster without overlays`, () => {
    for (const [Component, props] of [[detail.EventDetail, { event, locale }], [card.MerakiEventCard, { event, locale, now: Date.now(), featured: true }], [card.MerakiEventCard, { event, locale, now: Date.now() }]]) {
      const fragment = render(Component, props);
      const frame = fragment.querySelector("button[data-event-poster]");
      assert.ok(frame); assert.ok(frame.classList.contains("aspect-[4/5]"));
      assert.equal(frame.querySelector("img").getAttribute("src"), event.cover);
      assert.equal(frame.querySelector("img").classList.contains("object-contain"), true);
      assert.equal(frame.children.length, 1, "only the original image belongs on the poster");
      assert.equal(frame.querySelector("img").getAttribute("alt").includes(event.title), true);
      assert.equal(frame.getAttribute("aria-haspopup"), "dialog");
      assert.equal(fragment.querySelectorAll(".object-cover").length, 0);
      assert.equal(frame.closest("a"), null, "zoom is not nested in a navigation link");
      assert.ok(fragment.querySelector("h1,h2,h3").textContent.includes(event.title));
    }
  });

  test(`${locale} travel displays real fields, translated labels, safe links and Italian validity dates`, () => {
    const fragment = render(detail.EventDetail, { event: { ...event, logistics: data }, locale });
    const section = fragment.querySelector("#viaggio-soggiorno");
    assert.ok(section); assert.ok(fragment.querySelector('a[href="#viaggio-soggiorno"]'));
    assert.equal(section.querySelector("h2").textContent, travel.eventLogisticsLabels(locale).title);
    assert.ok(section.textContent.includes(travel.eventLogisticsLabels(locale).partner));
    assert.ok(section.textContent.includes(travel.eventLogisticsLabels(locale).suggested));
    assert.equal(section.querySelector("time").textContent, "20 novembre 2027");
    assert.equal(section.querySelector("time").getAttribute("datetime"), "2027-11-20");
    assert.ok(section.textContent.includes(logistics.logisticsText(data.accommodations[0].rate, locale)));
    assert.ok([...section.querySelectorAll("[data-rich-text] p")].some((node) => node.textContent === "Colazione inclusa"));
    assert.ok([...section.querySelectorAll("[data-rich-text] p")].some((node) => node.textContent === "Parcheggio gratuito"));
    assert.equal(section.querySelector("b").textContent, "codice"); assert.equal(section.querySelector("script"), null);
    assert.equal(section.textContent.includes("alert(1)"), false);
    assert.equal(section.querySelectorAll('a[target="_blank"]').length, 6);
    for (const anchor of section.querySelectorAll('a[target="_blank"]')) {
      assert.match(anchor.href, /^https:\/\//); assert.equal(anchor.rel, "noopener noreferrer");
    }
    assert.equal(section.querySelector('a[href="mailto:reception@example.test"]').textContent, "reception@example.test");
    assert.ok(section.querySelector('a[href="tel:+390471123456"]'));
    const suggested = section.querySelector('[data-accommodation-kind="suggested"]');
    assert.equal(suggested.querySelector("dl,time,a"), null, "empty optional fields have no invented values or links");
  });
}

test("empty, invalid and absent logistics render no section or travel jump; catalogue stays lean", () => {
  for (const value of [undefined, null, logistics.emptyEventLogistics(), { ...data, arrivals: [{ ...data.arrivals[0], linkUrl: "javascript:alert(1)" }] }]) {
    const fragment = render(detail.EventDetail, { event: { ...event, logistics: value }, locale: "it" });
    assert.equal(fragment.querySelector("#viaggio-soggiorno"), null);
    assert.equal(fragment.querySelector('a[href="#viaggio-soggiorno"]'), null);
  }
  const columns = readFileSync(new URL("../src/components/meraki/events-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(columns, /logistics/);
});

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale} travel renders rich benefits, booking, routes, onward legs, accessibility and contact safely`, () => {
    const translated = (label) => localized("", Object.fromEntries(["it", "en", "de", "es"].map((language) => [language, `<p><strong>${label} ${language}</strong> <em>Meraki</em></p><script>alert(1)</script>`])));
    const guide = { ...data,
      accommodations: [{ ...data.accommodations[0], benefits: translated("benefits"), bookingInstructions: translated("booking") }],
      arrivals: [{ ...data.arrivals[0], description: translated("route"), connections: [{ id: "bus-leg", mode: "bus", from: localized("Aeroporto"), to: localized("Evento"), service: localized(""), duration: localized(""), description: translated("leg"), linkUrl: "", mapUrl: "" }] }],
      accessibility: translated("accessibility"), contact: translated("contact"),
    };
    const fragment = render(travel.EventLogisticsSection, { logistics: guide, locale });
    assert.deepEqual([...fragment.querySelectorAll("[data-rich-text] strong")].map((node) => node.textContent), ["benefits", "booking", "route", "leg", "accessibility", "contact"].map((label) => `${label} ${locale}`));
    assert.equal(fragment.querySelectorAll("[data-rich-text] em").length, 6);
    assert.equal(fragment.querySelector("script"), null);
    assert.equal(fragment.textContent.includes("alert(1)"), false);
    assert.equal(fragment.querySelector("p p,p ul,p ol"), null, "rich block content is never nested in a paragraph");
  });
}

test("legacy event cards also preserve poster geometry and leave the event title outside the image", async () => {
  const { EventCard } = load("components/public/event-card.tsx", { "@/components/meraki/event-poster": poster, "@/i18n/routing": link, "next-intl/server": { getLocale: async () => "it" }, "@/lib/i18n-utils": load("lib/i18n-utils.ts") });
  const fragment = JSDOM.fragment(renderToStaticMarkup(await EventCard({ id: event.id, slug: event.slug, tipo: "evento", titolo: event.title, data_inizio: event.startsAt, copertina_url: event.cover, prezzo_cents: 3025, capacity: 0, posti_venduti: 0 })));
  const frame = fragment.querySelector("[data-event-poster]");
  assert.ok(frame.classList.contains("aspect-[4/5]")); assert.equal(frame.children.length, 1);
  assert.ok(fragment.querySelector("h3 a").textContent.includes(event.title));
  assert.ok(fragment.textContent.includes("30,25"));
  assert.ok(fragment.textContent.includes("Esaurito"), "a zero capacity is sold out, not unlimited");
});

test("expired partner offers show their actual past date with a clear label", () => {
  for (const locale of ["it", "en", "de", "es"]) {
    const expired = { ...data, accommodations: [{ ...data.accommodations[0], validUntil: "2020-01-02" }] };
    const fragment = render(travel.EventLogisticsSection, { logistics: expired, locale });
    assert.ok(fragment.querySelector("[data-expired-offer]").textContent.includes(travel.eventLogisticsLabels(locale).expired));
    assert.equal(fragment.querySelector("time").textContent, "2 gennaio 2020");
  }
});

test("a translation without an Italian or English fallback cannot create an empty travel section or dead jump", () => {
  const onlyGerman = { ...logistics.emptyEventLogistics(), contact: localized("", { de: "Nur auf Deutsch" }) };
  for (const locale of ["it", "en", "es"]) {
    const fragment = render(detail.EventDetail, { event: { ...event, logistics: onlyGerman }, locale });
    assert.equal(fragment.querySelector("#viaggio-soggiorno"), null);
    assert.equal(fragment.querySelector('a[href="#viaggio-soggiorno"]'), null);
  }
  const german = render(detail.EventDetail, { event: { ...event, logistics: onlyGerman }, locale: "de" });
  assert.ok(german.querySelector("#viaggio-soggiorno"));
  assert.ok(german.querySelector('a[href="#viaggio-soggiorno"]'));
});

test("suggested accommodation never claims a partner agreement when optional benefits or dates are retained", () => {
  const retained = { ...data, accommodations: [{ ...data.accommodations[0], kind: "suggested" }] };
  for (const locale of ["it", "en", "de", "es"]) {
    const fragment = render(travel.EventLogisticsSection, { logistics: retained, locale });
    const text = travel.eventLogisticsLabels(locale);
    assert.ok(fragment.textContent.includes(text.suggested));
    assert.ok(fragment.textContent.includes(text.services));
    assert.ok(fragment.textContent.includes(text.infoValid));
    assert.equal(fragment.textContent.includes(text.benefits), false);
    assert.equal(fragment.textContent.includes(text.valid), false);
  }
});

test("onward travel shows the airport, ordered departure and destination, service and duration in all four languages", () => {
  const multilingual = (it, en, de, es) => ({ it, en, de, es });
  const airport = multilingual("Aeroporto Esempio", "Example Airport", "Flughafen Beispiel", "Aeropuerto Ejemplo");
  const station = multilingual("Stazione Esempio", "Example Station", "Bahnhof Beispiel", "Estación Ejemplo");
  const venue = multilingual("Ingresso evento", "Event entrance", "Eventeingang", "Entrada del evento");
  const service = multilingual("Bus linea Esempio", "Example bus service", "Buslinie Beispiel", "Línea de autobús Ejemplo");
  const journey = { ...logistics.emptyEventLogistics(), arrivals: [{ ...data.arrivals[0], arrivalPoint: airport, connections: [
    { id: "airport-bus", mode: "bus", from: airport, to: station, service, duration: multilingual("40 minuti", "40 minutes", "40 Minuten", "40 minutos"), description: localized("Scendi qui <script>alert(1)</script>"), linkUrl: "https://travel.example.test/bus", mapUrl: "https://maps.example.test/station" },
    { id: "station-walk", mode: "walk", from: station, to: venue, service: localized(""), duration: localized("10 minuti"), description: localized(""), linkUrl: "", mapUrl: "" },
  ] }] };
  for (const locale of ["it", "en", "de", "es"]) {
    const fragment = render(travel.EventLogisticsSection, { logistics: journey, locale });
    const labels = travel.eventLogisticsLabels(locale);
    const list = fragment.querySelector(`ol[aria-label="${labels.connections}"]`);
    assert.ok(list);
    const steps = [...list.querySelectorAll("li[data-arrival-connection]")];
    assert.deepEqual(steps.map((step) => step.dataset.arrivalConnection), ["airport-bus", "station-walk"]);
    assert.ok(fragment.querySelector("[data-arrival-route]").textContent.includes(airport[locale]));
    const fields = [...steps[0].querySelectorAll("dd")].map((field) => field.textContent);
    assert.deepEqual(fields, [airport[locale], station[locale], service[locale], journey.arrivals[0].connections[0].duration[locale]]);
    assert.ok(steps[1].textContent.includes(labels.walk));
    assert.ok(steps[1].textContent.includes(venue[locale]));
    assert.ok(steps[1].textContent.includes("10 minuti"), "an untranslated leg falls back to Italian");
    assert.equal(steps[1].querySelectorAll("dd").length, 3, "empty services do not create labels");
    assert.equal(steps[1].querySelector("a"), null, "blank links do not create actions");
    assert.equal(fragment.querySelector("script"), null);
    assert.ok(steps[0].textContent.includes("Scendi qui"));
    assert.equal(steps[0].textContent.includes("alert(1)"), false);
    for (const anchor of fragment.querySelectorAll('a[target="_blank"]')) assert.equal(anchor.rel, "noopener noreferrer");
    assert.equal(steps[0].querySelector('a[href="https://travel.example.test/bus"]').textContent, labels.connectionLink);
    assert.equal(steps[0].querySelector('a[href="https://maps.example.test/station"]').textContent, labels.map);
  }
});

test("a legacy arrival remains a compact route without an empty point or connection list", () => {
  const fragment = render(travel.EventLogisticsSection, { logistics: { ...logistics.emptyEventLogistics(), arrivals: [data.arrivals[0]] }, locale: "it" });
  const route = fragment.querySelector("[data-arrival-route]");
  assert.equal(route.querySelector("h4").textContent, "Percorso plane");
  assert.equal(route.querySelector("ol"), null);
  assert.equal(route.textContent.includes(travel.eventLogisticsLabels("it").arrivalPoint), false);
  assert.equal(route.querySelectorAll("a").length, 1);
  assert.equal(travel.eventLogisticsLabels("de-DE").connections, travel.eventLogisticsLabels("de").connections);
  const unsafe = { ...data.arrivals[0], connections: [{ id: "bad", mode: "bus", from: localized("A"), to: localized("B"), service: localized(""), duration: localized(""), description: localized(""), linkUrl: "javascript:alert(1)", mapUrl: "" }] };
  assert.equal(render(travel.EventLogisticsSection, { logistics: { ...logistics.emptyEventLogistics(), arrivals: [unsafe] }, locale: "it" }).querySelector("#viaggio-soggiorno"), null);
});

test("poster zoom is contained inside its scroll area, resets on opening and closes with restored focus", async () => {
  const dom = new JSDOM("<!doctype html><body style='overflow:auto'><div id='root'></div></body>", { url: "https://meraki.test", pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector("button").focus(); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event("close")); };
  const interactivePoster = load("components/meraki/event-poster.tsx", { "next/image": image }, { document: dom.window.document });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await React.act(async () => root.render(React.createElement(interactivePoster.EventPoster, { src: event.cover, title: event.title, locale: "it" })));
    const trigger = dom.window.document.querySelector("[data-event-poster]");
    const dialog = dom.window.document.querySelector("dialog");
    const zoom = dialog.querySelector("button[aria-pressed]");
    const close = dialog.querySelector('button[aria-label="Chiudi locandina"]');
    const viewport = dialog.querySelector("[data-poster-viewport]");
    const enlarged = viewport.querySelector("img");
    assert.ok(dom.window.document.getElementById(dialog.getAttribute("aria-labelledby")));
    await React.act(async () => trigger.click());
    assert.equal(dialog.open, true); assert.equal(dom.window.document.body.style.overflow, "hidden");
    assert.equal(zoom.textContent, "Ingrandisci"); assert.equal(zoom.getAttribute("aria-pressed"), "false");
    assert.equal(zoom.getAttribute("aria-controls"), viewport.id);
    assert.equal(viewport.contains(zoom), false, "the toolbar stays outside the image's scrolling area");
    const documentStyles = dom.window.document.body.getAttribute("style");
    await React.act(async () => zoom.click());
    assert.equal(zoom.textContent, "Riduci"); assert.equal(zoom.getAttribute("aria-pressed"), "true");
    assert.equal(enlarged.getAttribute("src"), event.cover);
    assert.ok(enlarged.classList.contains("w-[1080px]")); assert.ok(enlarged.classList.contains("max-w-none"));
    assert.ok(viewport.classList.contains("overflow-auto")); assert.ok(viewport.classList.contains("min-w-0"));
    assert.ok(dialog.classList.contains("overflow-hidden"));
    assert.equal(dom.window.document.body.getAttribute("style"), documentStyles, "zoom only changes the image inside the constrained dialog");
    viewport.scrollTop = 200; viewport.scrollLeft = 150;
    await React.act(async () => zoom.click());
    assert.equal(zoom.textContent, "Ingrandisci"); assert.ok(enlarged.classList.contains("w-full"));
    await React.act(async () => zoom.click());
    await React.act(async () => dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })));
    assert.equal(dialog.open, false); assert.equal(dom.window.document.body.style.overflow, "auto");
    assert.equal(dom.window.document.activeElement, trigger);
    await React.act(async () => trigger.click());
    assert.equal(zoom.getAttribute("aria-pressed"), "false", "every opening starts at fit-to-screen size");
    assert.equal(viewport.scrollTop, 0); assert.equal(viewport.scrollLeft, 0);
    await React.act(async () => close.click());
    assert.equal(dialog.open, false); assert.equal(dom.window.document.activeElement, trigger);
    await React.act(async () => trigger.click());
    await React.act(async () => root.unmount());
    assert.equal(dom.window.document.body.style.overflow, "auto", "unmounting an open poster releases scroll lock");
  } finally {
    if (dom.window.document.getElementById("root").children.length) await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
