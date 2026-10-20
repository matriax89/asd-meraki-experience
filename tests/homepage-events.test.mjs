import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createTranslator } from "next-intl";

const require = createRequire(import.meta.url);
const now = Date.parse("2026-10-19T10:00:00Z");
class SnapshotDate extends Date { static now() { return now; } }
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, Date: SnapshotDate, require: (id) => mocks[id] || require(id) });
  return compiledModule.exports;
}
const Anchor = ({ children, ...props }) => React.createElement("a", props, children);
const Image = (props) => {
  const imageProps = { ...props };
  delete imageProps.fill;
  delete imageProps.priority;
  delete imageProps.unoptimized;
  return React.createElement("img", imageProps);
};
const Container = ({ children, className, id }) => React.createElement("div", { className, id }, children);
const Empty = () => null;
const common = { "@/i18n/routing": { Link: Anchor }, "next/image": { __esModule: true, default: Image } };
const i18n = load("lib/i18n-utils.ts");
const model = load("components/meraki/event-model.ts");
const eventsData = load("components/meraki/events-data.ts", { "@/lib/i18n-utils": i18n });
const poster = load("components/meraki/event-poster.tsx", common);
const card = load("components/meraki/event-card.tsx", { ...common, "./event-model": model, "./event-poster": poster });
const eventFeed = load("components/meraki/event-feed.tsx", { ...common, "./event-model": model, "./event-card": card });
const past = { id: "past", slug: "old-event", tipo: "evento", titolo: { it: "Evento passato", en: "Past event", de: "Vergangenes Event", es: "Evento pasado" }, sottotitolo: null, data_inizio: "2026-08-04T18:00:00+02:00", data_fine: null, copertina_url: null, location: "Bolzano", indirizzo: null, prezzo_cents: 1000, capacity: 30, posti_venduti: 0 };
const future = { ...past, id: "future", slug: "next-event", titolo: { it: "Evento futuro", en: "Future event", de: "Künftiges Event", es: "Evento futuro" }, data_inizio: "2026-12-01T18:00:00+01:00" };

function catalogue(rows, error = null, packagePrices) {
  const requests = [];
  const supabase = { from(table) {
    const request = { table, filters: [] };
    requests.push(request);
    const result = table === "events" ? { data: rows, error } : { data: table === "site_settings" ? null : [], error: null };
    const query = { select() { return query; }, eq(key, value) { request.filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; }, single() { return query; }, then(resolve) { return Promise.resolve(result).then(resolve); } };
    return query;
  } };
  const server = { createClient: async () => supabase };
  const feed = load("lib/events/public-feed.ts", {
    react: { ...React, cache: (callback) => callback },
    "@/lib/supabase/server": server,
    "@/components/meraki/events-data": eventsData,
    "@/components/meraki/event-model": model,
  });
  const enrichment = [];
  const { default: Home } = load("app/[locale]/(public)/page.tsx", {
    ...common,
    "@/lib/supabase/server": server,
    "@/lib/events/public-feed": feed,
    "@/lib/events/social-data": {},
    "@/lib/events/social-metadata": {},
    "@/components/meraki/event-feed": eventFeed,
    "@/lib/commerce/feed": { enrichCommerceFeed: async (events) => { enrichment.push(events); return events.map((event) => ({ ...event, price: 1900, priceFrom: true, packagePrices })); } },
    "@/lib/i18n-utils": i18n,
    "next-intl/server": { getTranslations: async ({ locale, namespace }) => createTranslator({ locale, namespace, messages: JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8")), onError: error => { throw error; } }) },
    "@/components/ui/fade-in": { FadeIn: Container, StaggerContainer: Container, StaggerItem: Container },
    "@/components/public/course-card": { CourseCard: Empty },
    "@/components/public/youtube-carousel": { YoutubeCarousel: Empty },
    "./orario/schedule-client": { ScheduleClient: Empty },
    "@/components/public/instagram-widget": { InstagramWidget: Empty },
  });
  return { feed, requests, enrichment, renderHome: async (locale = "it") => renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) })) };
}

test("published feed uses one explicit clock and activates home only for future or ongoing events", async () => {
  const ongoing = { ...past, data_inizio: "2026-10-19T09:00:00Z", data_fine: "2026-10-19T11:00:00Z" };
  for (const [rows, expected] of [[[], false], [[past], false], [[future], true], [[ongoing], true], [[{ ...ongoing, data_fine: "2026-10-19T10:00:00Z" }], false]]) {
    const fixture = catalogue(rows);
    const result = await fixture.feed.getPublishedEventFeed("it");
    assert.equal(result.hasUpcoming, expected);
    assert.equal(result.now, now);
    assert.deepEqual(fixture.requests[0].filters, [["attivo", true]]);
    assert.equal(fixture.enrichment.length, 0, "layout catalogue does not perform commerce reads");
  }
  const failed = await catalogue([future], { message: "temporarily unavailable" }).feed.getPublishedEventFeed("it");
  assert.equal(failed.hasUpcoming, false);
  assert.equal(failed.loadError, true);
});

test("active events replace only the general hero with the same localized app feed without showing prices", async () => {
  for (const locale of ["it", "en", "de", "es"]) {
    const fixture = catalogue([past, future]);
    const html = await fixture.renderHome(locale);
    assert.match(html, /data-meraki-home-events/);
    assert.match(html, /href="\/eventi\/next-event"/);
    assert.doesNotMatch(html, /href="\/eventi\/old-event"/);
    assert.ok(!html.includes(JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8")).Index.hero.headline), "active event replaces the localized general hero");
    assert.ok(!html.includes(model.eventPrice(1900, locale)), "homepage leaves prices on the event detail page");
    assert.ok(html.includes(model.eventLabels(locale).purchase), "the localized purchase action remains available");
    assert.match(html, /href="\/eventi\/next-event#top"/);
    assert.equal((html.match(/<main\b/g) || []).length, 1);
    for (const anchor of ["chi-siamo", "corsi", "orario"]) assert.ok(html.includes(`id="${anchor}"`), `general navigation target ${anchor} remains reachable`);
    assert.equal(fixture.enrichment.length, 1);
  }
});

test("empty, archived-only and unavailable event catalogues preserve the general homepage", async () => {
  for (const fixture of [catalogue([]), catalogue([past]), catalogue([future], { message: "unavailable" })]) {
    const html = await fixture.renderHome();
    assert.doesNotMatch(html, /data-meraki-home-events/);
    assert.ok(html.includes(JSON.parse(readFileSync(new URL("../src/messages/it.json", import.meta.url), "utf8")).Index.hero.headline), "without active events the actual general hero copy remains");
    assert.equal(fixture.enrichment.length, 0);
  }
});

test("the general homepage links to participation options without repeating package prices", async () => {
  const packagePrices = [{ id: "bundle", name: "Workshop + Masterclass", prices: [
    { id: "early", label: "Early Bird", amountCents: 6500, startsAt: null, endsAt: "2026-12-04T22:59:00Z" },
    { id: "standard", label: "Standard", amountCents: 8500, startsAt: "2026-12-04T23:00:00Z", endsAt: null },
  ] }];
  for (const locale of ["it", "en", "de", "es"]) {
    const html = await catalogue([future], null, packagePrices).renderHome(locale);
    assert.doesNotMatch(html, /Workshop \+ Masterclass|Early Bird|23,5%|04\/12\/2026/);
    for (const amount of [1900, 6500, 8500]) assert.ok(!html.includes(model.eventPrice(amount, locale)));
    assert.match(html, /href="\/eventi\/next-event#top"/);
    assert.ok(html.includes(model.eventLabels(locale).purchase));
  }
});

test("homepage navigation remains legible above the light event feed and uses the original logo variants", () => {
  const { Header } = load("components/public/header.tsx", {
    ...common,
    "next-intl": { useTranslations: () => (key) => key },
    "next/navigation": { usePathname: () => "/it" },
    "./language-switcher": { LanguageSwitcher: Empty },
    "framer-motion": { motion: { header: ({ children, className }) => React.createElement("header", { className }, children) }, AnimatePresence: React.Fragment },
  });
  const eventHeader = renderToStaticMarkup(React.createElement(Header, { appearance: "solid" }));
  assert.match(eventHeader, /src="\/images\/logo-meraki-horizontal.webp"/);
  assert.match(eventHeader, /bg-white\/80/);
  assert.match(eventHeader, /text-foreground/);
  const generalHeader = renderToStaticMarkup(React.createElement(Header));
  assert.match(generalHeader, /src="\/images\/logo-meraki-horizontal-white.webp"/);
  assert.match(generalHeader, /text-white/);
  const configuredHeader = renderToStaticMarkup(React.createElement(Header, { appearance: "solid", logoUrl: "https://assets.example.test/original-meraki.png" }));
  assert.match(configuredHeader, /src="https:\/\/assets.example.test\/original-meraki.png"/);
});
