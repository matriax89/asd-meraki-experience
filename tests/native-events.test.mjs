import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/eventi", pretendToBeVisual: true });
const descriptors = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
after(() => { dom.window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const sourcePath = name === "commerce-localization" ? "../src/lib/commerce/localization.ts" : `../src/components/meraki/${name}.${["event-model", "commerce-public-model"].includes(name) ? "ts" : "tsx"}`;
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, window: dom.window, document: dom.window.document, Date, require: (specifier) => {
    if (specifier.startsWith("./")) return load(specifier.slice(2));
    if (specifier === "@/lib/commerce/localization") return load("commerce-localization");
    if (specifier === "@/i18n/routing") return { Link: ({ children, ...props }) => React.createElement("a", props, children) };
    return require(specifier);
  } });
  modules.set(name, compiledModule.exports);
  return compiledModule.exports;
}
const model = load("event-model");
const { EventFeed } = load("event-feed");
const now = Date.parse("2026-10-18T15:00:00Z");
const past = { id: "past", slug: "outdoor-postal", type: "evento", title: "Outdoor Postal", subtitle: "Muoviti insieme a Denise", startsAt: "2026-08-04T18:30:00Z", endsAt: null, cover: null, location: "Postal", address: null, price: 1500, capacity: 20, sold: 10 };
const future = { ...past, id: "future", slug: "workshop", type: "workshop", title: "Pratica con Meraki", startsAt: "2026-12-04T17:00:00Z", location: "Merano" };
const packageEvent = { ...future, price: 4500, priceFrom: true, packagePrices: [{ id: "ws", name: "Workshop completo", prices: [
  { id: "early", label: "Early Bird", amountCents: 4500, startsAt: null, endsAt: "2026-11-01T23:00:00Z" },
  { id: "standard", label: "Standard", amountCents: 5500, startsAt: "2026-11-01T23:00:00Z", endsAt: null },
] }] };
function button(text) { return [...document.querySelectorAll("button")].find((element) => element.textContent === text); }
async function render(events, locale = "it") { const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); await act(async () => root.render(React.createElement(EventFeed, { events, locale, now }))); return { host, root, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } }; }

test("a past-only catalogue stays honest while preserving the event in the archive", async () => {
  const screen = await render([past]);
  try {
    assert.match(screen.host.textContent, /Il prossimo momento sta arrivando/);
    assert.doesNotMatch(screen.host.textContent, /Da ricordare/);
    assert.equal(screen.host.querySelector('a[href="/eventi/outdoor-postal"]'), null);
    assert.equal(screen.host.querySelector('[aria-live="polite"]').textContent, "0 esperienze");
    await act(async () => button("Passati").click());
    assert.equal(button("Passati").getAttribute("aria-pressed"), "true");
    assert.equal(screen.host.querySelector('[aria-live="polite"]').textContent, "1 esperienza");
    assert.ok(screen.host.querySelector('a[href="/eventi/outdoor-postal"]'));
    assert.match(screen.host.textContent, /Da ricordare/);
    assert.doesNotMatch(screen.host.textContent, /Il prossimo momento sta arrivando/);
  } finally { await screen.cleanup(); }
});

test("searching a place and changing categories filters genuine event links and offers reset", async () => {
  const screen = await render([past, future]);
  try {
    const input = screen.host.querySelector('input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(input, "MERANO"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.ok(screen.host.querySelector('a[href="/workshop/workshop"]'));
    assert.equal(screen.host.querySelector('[aria-live="polite"]').textContent, "1 esperienza");
    await act(async () => button("Eventi").click());
    assert.match(screen.host.textContent, /Nessuna esperienza trovata/);
    assert.equal(screen.host.querySelector('a[href="/workshop/workshop"]'), null);
    await act(async () => button("Azzera i filtri").click());
    assert.equal(input.value, "");
    assert.equal(button("Tutti").getAttribute("aria-pressed"), "true");
    assert.ok(screen.host.querySelector('a[href="/workshop/workshop"]'));
  } finally { await screen.cleanup(); }
});

test("event time uses Rome even around UTC midnight, and capacity zero stays sold out", () => {
  assert.equal(model.eventDate("2026-08-04T22:30:00Z", "it", { day: "2-digit", month: "2-digit", year: "numeric" }), "05/08/2026");
  assert.equal(model.availablePlaces({ capacity: 0, sold: 0 }), 0);
  assert.equal(model.availablePlaces({ capacity: 2, sold: 3 }), 0);
  assert.equal(model.availablePlaces({ capacity: null, sold: 8 }), null);
});

test("featured package prices replace the minimum price and refresh when returning after a tier change", async () => {
  const screen = await render([packageEvent]);
  const originalDateNow = Date.now;
  try {
    assert.match(screen.host.textContent, /Workshop completo/);
    assert.match(screen.host.textContent, /Early Bird/);
    assert.match(screen.host.textContent, /18,1%/);
    assert.doesNotMatch(screen.host.textContent, /da 45/);
    Date.now = () => Date.parse("2026-11-01T23:00:00Z");
    await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
    assert.match(screen.host.textContent, /Workshop completo/);
    assert.match(screen.host.textContent, /Standard/);
    assert.doesNotMatch(screen.host.textContent, /Early Bird|18,1%|45\s*€/);
  } finally { Date.now = originalDateNow; await screen.cleanup(); }
});

test("the archive does not promote an old Early Bird offer", async () => {
  const screen = await render([{ ...packageEvent, startsAt: past.startsAt }]);
  try {
    await act(async () => button("Passati").click());
    assert.match(screen.host.textContent, /Da ricordare/);
    assert.doesNotMatch(screen.host.textContent, /Early Bird|18,1%|Workshop completo/);
  } finally { await screen.cleanup(); }
});

test("workshop discovery includes masterclasses and keeps ongoing experiences out of the archive", () => {
  const ongoing = { ...future, id: "ongoing", startsAt: "2026-10-18T14:00:00Z", endsAt: "2026-10-18T17:00:00Z", type: "masterclass" };
  const result = model.filterEvents([past, ongoing, future], "workshop", "upcoming", "", now);
  assert.deepEqual([...result].map((event) => event.id), ["ongoing", "future"]);
  assert.equal(model.isPastEvent(ongoing, now), false);
});

test("event archive boundaries respect explicit ends and equivalent timezone offsets", () => {
  const overnight = { ...future, startsAt: "2026-10-18T23:30:00+02:00", endsAt: "2026-10-19T02:00:00+02:00" };
  assert.equal(model.isPastEvent(overnight, Date.parse("2026-10-18T23:59:59.999Z")), false);
  assert.equal(model.isPastEvent(overnight, Date.parse("2026-10-19T00:00:00Z")), true);
  assert.equal(model.isPastEvent({ ...overnight, endsAt: "2026-10-19T00:00:00Z" }, Date.parse("2026-10-19T02:00:00+02:00")), true);
  assert.equal(model.isPastEvent({ ...future, endsAt: null }, Date.parse(future.startsAt) - 1), false);
  assert.equal(model.isPastEvent({ ...future, endsAt: null }, Date.parse(future.startsAt)), true);
  const severalDays = { ...overnight, endsAt: "2026-10-21T18:00:00+02:00" };
  assert.equal(model.isPastEvent(severalDays, Date.parse("2026-10-20T10:00:00Z")), false);
});

test("returning to the installed app moves a newly ended event into its archive", async () => {
  const ongoing = { ...future, startsAt: "2026-10-18T14:00:00Z", endsAt: "2026-10-18T16:00:00Z" };
  const screen = await render([ongoing]);
  const originalDateNow = Date.now;
  try {
    assert.ok(screen.host.querySelector('a[href="/workshop/workshop"]'));
    Date.now = () => Date.parse("2026-10-18T16:00:00Z");
    await act(async () => window.dispatchEvent(new dom.window.Event("focus")));
    assert.equal(screen.host.querySelector('a[href="/workshop/workshop"]'), null);
    assert.match(screen.host.textContent, /Il prossimo momento sta arrivando/);
    await act(async () => button("Passati").click());
    assert.ok(screen.host.querySelector('a[href="/workshop/workshop"]'));
  } finally { Date.now = originalDateNow; await screen.cleanup(); }
});

test("past-only catalogues keep their archive separate in every supported language", async () => {
  for (const [locale, archive] of [["it", "Passati"], ["en", "Past"], ["de", "Vergangen"], ["es", "Pasados"]]) {
    const screen = await render([past], locale);
    try {
      assert.equal(screen.host.querySelector('a[href="/eventi/outdoor-postal"]'), null, locale);
      await act(async () => button(archive).click());
      assert.ok(screen.host.querySelector('a[href="/eventi/outdoor-postal"]'), locale);
      assert.equal(button(archive).getAttribute("aria-pressed"), "true");
    } finally { await screen.cleanup(); }
  }
});


test("Spanish discovery translates filters, counts, event actions and archive labels", async () => {
  const screen = await render([past, future], "es");
  try {
    assert.ok(button("Todos"));
    assert.ok(button("Eventos"));
    assert.ok(button("Próximos"));
    assert.equal(screen.host.querySelector('input[type="search"]').getAttribute("aria-label"), "Busca un evento o un lugar");
    assert.equal(screen.host.querySelector('[aria-live="polite"]').textContent, "1 experiencia");
    await act(async () => button("Pasados").click());
    assert.match(screen.host.textContent, /Para recordar/);
    assert.equal(model.eventLabels("es").soldOut, "Agotado");
    assert.equal(model.eventLabels("es").qrBody.includes("sin crear una cuenta"), true);
  } finally { await screen.cleanup(); }
});
