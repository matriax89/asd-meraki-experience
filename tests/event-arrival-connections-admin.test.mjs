import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/eventi/nuovo", pretendToBeVisual: true });
const original = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });

function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => id in mocks ? mocks[id] : require(id), Date, Intl, Error, crypto: webcrypto });
  return compiledModule.exports;
}
const CustomSelect = React.forwardRef((props, ref) => React.createElement("select", { ...props, ref }));
CustomSelect.displayName = "CustomSelectFixture";
const elements = load("components/admin/form-elements.tsx", { "@/components/ui/custom-select": { CustomSelect } });
const { EventLogisticsEditor } = load("components/admin/event-logistics-editor.tsx", { "@/components/admin/form-elements": elements });
const localized = (it = "", en = "", de = "", es = "") => ({ it, en, de, es });
const route = (id = "route-1") => ({ id, mode: "plane", title: localized("Via aeroporto"), description: localized("Indicazioni esistenti"), linkUrl: "https://travel.example.test/orari" });
const connection = (id, from, to) => ({ id, mode: "bus", from: localized(from), to: localized(to), service: localized(`Linea ${id}`), duration: localized("45 minuti"), description: localized(`Note ${id}`), linkUrl: "", mapUrl: "" });
const initial = (arrivals = [route()]) => ({ version: 1, accommodations: [], arrivals, accessibility: localized("Ingresso accessibile"), contact: localized("Contatti esistenti") });
const json = (value) => JSON.parse(JSON.stringify(value));

async function mount(context, value = initial()) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let latest = value;
  function Harness() {
    const [draft, setDraft] = React.useState(value);
    return React.createElement(EventLogisticsEditor, { value: draft, onChange: (next) => { latest = next; setDraft(next); } });
  }
  await act(async () => root.render(React.createElement(Harness)));
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const field = (path) => host.querySelector(`[data-logistics-path="${path}"]`);
  const change = async (input, text) => act(async () => {
    const prototype = input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : input.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, text);
    input.dispatchEvent(new dom.window.Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  const click = async (text, scope = host) => {
    const button = [...scope.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === text || candidate.getAttribute("aria-label") === text);
    assert.ok(button, `Missing button: ${text}`);
    await act(async () => button.click());
  };
  const language = async (path, code) => {
    const label = host.querySelector(`label[for="${field(path).id}"]`);
    await click(code, label.parentElement);
  };
  return { host, field, change, click, language, value: () => latest };
}

test("legacy arrival rows stay unchanged and name their arrival point according to the chosen transport", async (context) => {
  const legacy = initial();
  const screen = await mount(context, legacy);
  assert.equal(screen.value(), legacy);
  assert.equal("connections" in legacy.arrivals[0], false);
  assert.equal("arrivalPoint" in legacy.arrivals[0], false);
  assert.equal(screen.host.querySelectorAll("[data-arrival-connection]").length, 0);
  assert.match(screen.host.textContent, /Nome aeroporto di arrivo/);
  const select = screen.host.querySelector("[data-arrival] select");
  for (const [mode, label] of [["train", "Stazione di arrivo"], ["bus", "Fermata di arrivo"], ["car", "Punto di arrivo in auto"], ["plane", "Nome aeroporto di arrivo"]]) {
    await screen.change(select, mode);
    assert.match(screen.host.textContent, new RegExp(label));
  }
  assert.equal(screen.value().arrivals[0].description.it, "Indicazioni esistenti");
  assert.equal(screen.value().arrivals[0].linkUrl, "https://travel.example.test/orari");
  assert.equal("connections" in screen.value().arrivals[0], false);
});

test("new connections copy all four languages from the previous point only when added", async (context) => {
  const arrivalPoint = localized("Aeroporto", "Airport", "Flughafen", "Aeropuerto");
  const screen = await mount(context, initial([{ ...route(), arrivalPoint }]));
  await screen.click("Aggiungi collegamento");
  assert.deepEqual(json(screen.value().arrivals[0].connections[0].from), arrivalPoint);
  assert.equal(screen.value().arrivals[0].connections[0].to.it, "");
  await screen.change(screen.field("arrivals.0.arrivalPoint"), "Aeroporto corretto");
  assert.equal(screen.value().arrivals[0].connections[0].from.it, "Aeroporto", "later edits do not silently replace an existing connection");
  for (const [code, text] of Object.entries(localized("Stazione", "Station", "Bahnhof", "Estación"))) {
    await screen.language("arrivals.0.connections.0.to", code);
    await screen.change(screen.field("arrivals.0.connections.0.to"), text);
  }
  await screen.click("Aggiungi collegamento");
  assert.deepEqual(json(screen.value().arrivals[0].connections[1].from), localized("Stazione", "Station", "Bahnhof", "Estación"));
  await screen.language("arrivals.0.connections.0.to", "it");
  await screen.change(screen.field("arrivals.0.connections.0.to"), "Altra stazione");
  assert.equal(screen.value().arrivals[0].connections[1].from.it, "Stazione");
  await screen.change(screen.field("arrivals.0.connections.1.from"), "Partenza personalizzata");
  assert.equal(screen.value().arrivals[0].connections[1].from.it, "Partenza personalizzata");
});

test("without a named arrival point a new connection does not guess its departure from the route title", async (context) => {
  const screen = await mount(context);
  await screen.click("Aggiungi collegamento");
  assert.equal(screen.value().arrivals[0].connections[0].from.it, "");
  assert.equal(screen.value().arrivals[0].connections[0].mode, "bus");
  for (const name of ["from", "to"]) {
    const input = screen.field(`arrivals.0.connections.0.${name}`);
    assert.ok(input.closest("[data-arrival-connection-required]"));
    assert.equal(input.required, false, "Italian validity is checked by the wizard while translated inputs remain optional");
  }
});

test("reordering and removing connections preserves data, selected translation tabs and other travel information", async (context) => {
  const first = connection("bus-1", "Aeroporto", "Stazione");
  const second = connection("train-1", "Stazione", "Sede evento");
  const screen = await mount(context, initial([{ ...route(), connections: [first, second] }]));
  await screen.language("arrivals.0.connections.0.service", "de");
  await screen.change(screen.field("arrivals.0.connections.0.service"), "Deutsche Linie");
  await screen.change(screen.field("arrivals.0.connections.0.linkUrl"), "https://transport.example.test/tickets");
  await screen.click("Sposta dopo il collegamento 1");
  assert.deepEqual(json(screen.value().arrivals[0].connections.map((item) => item.id)), ["train-1", "bus-1"]);
  assert.equal(screen.field("arrivals.0.connections.1.service").value, "Deutsche Linie", "stable IDs keep the active language tab when the row moves");
  assert.equal(screen.value().arrivals[0].connections[1].from.it, "Aeroporto");
  assert.equal(screen.value().arrivals[0].connections[1].linkUrl, "https://transport.example.test/tickets");
  assert.equal(screen.host.querySelector('[aria-label="Sposta prima il collegamento 1"]').disabled, true);
  assert.equal(screen.host.querySelector('[aria-label="Sposta dopo il collegamento 2"]').disabled, true);
  await screen.click("Rimuovi collegamento 1");
  assert.equal(screen.value().arrivals[0].connections.length, 1);
  assert.equal(screen.value().arrivals[0].connections[0].id, "bus-1");
  assert.equal(screen.value().arrivals[0].connections[0].service.de, "Deutsche Linie");
  assert.equal(screen.value().accessibility.it, "Ingresso accessibile");
  assert.equal(screen.value().contact.it, "Contatti esistenti");
});

test("each connection offers every supported transport and enforces a maximum of eight rows", async (context) => {
  const screen = await mount(context, initial([{ ...route(), connections: Array.from({ length: 7 }, (_, index) => connection(`leg-${index}`, "Partenza", "Arrivo")) }]));
  const modes = [...screen.field("arrivals.0.connections.0.mode").options].map((option) => option.value).sort();
  assert.deepEqual(modes, ["bus", "car", "other", "plane", "shuttle", "taxi", "train", "walk"]);
  await screen.change(screen.field("arrivals.0.connections.0.mode"), "shuttle");
  assert.equal(screen.value().arrivals[0].connections[0].mode, "shuttle");
  await screen.click("Aggiungi collegamento");
  assert.equal(screen.value().arrivals[0].connections.length, 8);
  const add = [...screen.host.querySelectorAll("button")].find((button) => button.textContent === "Aggiungi collegamento");
  assert.equal(add.disabled, true);
  await screen.click("Aggiungi collegamento");
  assert.equal(screen.value().arrivals[0].connections.length, 8);
  assert.equal(screen.field("arrivals.0.connections.0.linkUrl").type, "url");
  assert.equal(screen.field("arrivals.0.connections.0.mapUrl").type, "url");
  assert.match(screen.host.textContent, /fino a 8 collegamenti/);
});

test("editing an itinerary retains an unsaved invalid accommodation date and its existing data", async (context) => {
  const value = initial();
  value.accommodations = [{ id: "hotel", kind: "suggested", name: "Hotel esistente", address: "Via Esempio", mapUrl: "", bookingUrl: "", phone: "", email: "", distance: localized(), rate: localized(), benefits: localized(), bookingInstructions: localized(), validUntil: null }];
  const screen = await mount(context, value);
  await screen.change(screen.field("accommodations.0.validUntil"), "31/02/2027");
  await screen.click("Aggiungi collegamento");
  await screen.change(screen.field("arrivals.0.connections.0.to"), "Sede evento");
  assert.equal(screen.field("accommodations.0.validUntil").value, "31/02/2027");
  assert.equal(screen.field("accommodations.0.validUntil").validity.customError, true);
  assert.equal(screen.value().accommodations[0].name, "Hotel esistente");
  assert.equal(screen.value().accommodations[0].address, "Via Esempio");
});
