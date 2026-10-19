import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/eventi/nuovo", pretendToBeVisual: true });
const originals = new Map();
class ResizeObserverFixture { observe() {} unobserve() {} disconnect() {} }
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document,
  Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: ResizeObserverFixture, IS_REACT_ACT_ENVIRONMENT: true,
})) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.ResizeObserver = ResizeObserverFixture;
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function load(file) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require, Date, Intl, Error });
  return compiledModule.exports;
}
const { DateTimeField } = load("components/admin/date-time-field.tsx");
const { fromRomeInput } = load("lib/commerce/rome-time.ts");

async function mount(context, initialValue = "2026-10-19T18:30", initialProps = {}, insideDialog = false) {
  const changes = [];
  const host = document.createElement(insideDialog ? "dialog" : "div");
  if (insideDialog) host.open = true;
  document.body.append(host);
  const root = createRoot(host);
  let props = initialProps;
  function Harness() {
    const [value, setValue] = React.useState(initialValue);
    return React.createElement("form", null, React.createElement(DateTimeField, {
      label: "Inizio Evento", value, ...props,
      onChange(next) { changes.push(next); setValue(next); },
    }));
  }
  await act(async () => root.render(React.createElement(Harness)));
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const date = host.querySelector('[aria-label="Data · Inizio Evento"]');
  const time = host.querySelector('[aria-label="Ora · Inizio Evento"]');
  const trigger = host.querySelector('[aria-label="Apri calendario · Inizio Evento"]');
  const change = async (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const click = async (element) => {
    assert.ok(element, "The requested control is present");
    await act(async () => { element.focus(); element.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  };
  const key = async (element, key, options = {}) => act(async () => {
    element.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
  const rerender = async (nextProps) => {
    props = nextProps;
    await act(async () => root.render(React.createElement(Harness)));
  };
  return { host, date, time, trigger, changes, change, click, key, rerender };
}

test("date and time use labeled custom text fields in Italian without native pickers", async (context) => {
  const screen = await mount(context);
  assert.equal(screen.date.value, "19/10/2026");
  assert.equal(screen.time.value, "18:30");
  assert.equal(screen.host.querySelector("legend").textContent, "Inizio Evento");
  assert.equal(screen.host.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]'), null);
  assert.match(screen.host.textContent, /Giorno\/mese\/anno · Ora 24 h · Orario italiano/);
  assert.equal(screen.host.querySelector("form").checkValidity(), true);
});

test("numeric keyboard entry emits a Rome wall time without converting through the browser zone", async (context) => {
  const screen = await mount(context, "");
  for (const value of ["3", "30", "300", "3003", "30032", "300320", "3003202", "30032026"]) await screen.change(screen.date, value);
  assert.equal(screen.date.value, "30/03/2026");
  for (const value of ["1", "18", "184", "1845"]) await screen.change(screen.time, value);
  assert.equal(screen.time.value, "18:45");
  assert.equal(screen.changes.at(-1), "2026-03-30T18:45");
});

test("invalid civil dates, invalid 24-hour times and incomplete optional fields block form submission", async (context) => {
  const screen = await mount(context);
  await screen.change(screen.date, "31/02/2026");
  assert.equal(screen.changes.at(-1), "");
  assert.equal(screen.date.value, "31/02/2026");
  assert.equal(screen.host.querySelector("form").checkValidity(), false);
  assert.match(screen.date.validationMessage, /data valida/);
  await screen.change(screen.date, "29/02/2028");
  assert.equal(screen.changes.at(-1), "2028-02-29T18:30");
  await screen.change(screen.time, "24:00");
  assert.equal(screen.time.checkValidity(), false);
  assert.match(screen.time.validationMessage, /00:00 a 23:59/);
  await screen.change(screen.time, "");
  assert.equal(screen.time.required, true);
  assert.equal(screen.host.querySelector("form").checkValidity(), false);
  await screen.change(screen.date, "");
  assert.equal(screen.time.required, false);
  assert.equal(screen.host.querySelector("form").checkValidity(), true);
});

test("DST gap and repeated-hour wall values reach the consumer unchanged and its error blocks submit", async (context) => {
  const screen = await mount(context, "");
  for (const [date, wallTime, message] of [
    ["29/03/2026", "2026-03-29T02:30", /non esiste/],
    ["25/10/2026", "2026-10-25T02:30", /ambigua/],
  ]) {
    await screen.rerender({});
    await screen.change(screen.date, date);
    await screen.change(screen.time, "02:30");
    assert.equal(screen.changes.at(-1), wallTime);
    let error;
    try { fromRomeInput(wallTime); } catch (caught) { error = caught.message; }
    assert.match(error, message);
    await screen.rerender({ error });
    assert.equal(screen.host.querySelector("form").checkValidity(), false);
    assert.equal(screen.date.validationMessage, error);
    assert.equal(screen.host.querySelector('[role="alert"]').textContent, error);
  }
});

test("the calendar starts on Monday and choosing another month preserves the clock", async (context) => {
  const screen = await mount(context);
  await screen.click(screen.trigger);
  let grid = document.querySelector('[role="grid"]');
  assert.equal(grid.getAttribute("aria-label"), "ottobre 2026");
  assert.deepEqual([...grid.querySelectorAll("th")].map((item) => item.textContent), ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"]);
  assert.equal(document.activeElement.getAttribute("aria-label"), "lunedì 19 ottobre 2026");
  await screen.click(document.querySelector('[aria-label="Mese successivo"]'));
  grid = document.querySelector('[role="grid"]');
  assert.equal(grid.getAttribute("aria-label"), "novembre 2026");
  await screen.click(grid.querySelector('[aria-label="venerdì 20 novembre 2026"]'));
  assert.equal(screen.changes.at(-1), "2026-11-20T18:30");
  assert.equal(document.querySelector('[role="grid"]'), null);
});

test("calendar keyboard navigation crosses month/year boundaries and Escape returns focus", async (context) => {
  const screen = await mount(context, "2026-12-31T18:30");
  await screen.click(screen.trigger);
  await screen.key(document.activeElement, "ArrowRight");
  assert.equal(document.activeElement.getAttribute("aria-label"), "venerdì 1 gennaio 2027");
  await screen.key(document.activeElement, "Home");
  assert.equal(document.activeElement.getAttribute("aria-label"), "lunedì 28 dicembre 2026");
  await screen.key(document.activeElement, "PageDown", { shiftKey: true });
  assert.equal(document.activeElement.getAttribute("aria-label"), "martedì 28 dicembre 2027");
  await screen.key(document.activeElement, "Escape");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  assert.equal(document.querySelector('[role="grid"]'), null);
  assert.equal(document.activeElement, screen.trigger);
});

test("calendar date bounds and exact wall-time bounds are enforced", async (context) => {
  const screen = await mount(context, "2026-10-19T18:30", { min: "2026-10-18T19:00", max: "2026-10-20T20:00" });
  await screen.click(screen.trigger);
  assert.equal(document.querySelector('[aria-label="sabato 17 ottobre 2026"]').disabled, true);
  assert.equal(document.querySelector('[aria-label="mercoledì 21 ottobre 2026"]').disabled, true);
  await screen.click(document.querySelector('[aria-label="domenica 18 ottobre 2026"]'));
  assert.equal(screen.host.querySelector("form").checkValidity(), false);
  assert.match(screen.date.validationMessage, /intervallo consentito/);
  await screen.change(screen.time, "19:00");
  assert.equal(screen.host.querySelector("form").checkValidity(), true);
});

test("a partially available adjacent month remains reachable and empty out-of-range fields focus an allowed date", async (context) => {
  const screen = await mount(context, "2026-10-19T18:30", { min: "2026-10-18T19:00", max: "2026-11-05T20:00" });
  await screen.click(screen.trigger);
  assert.equal(document.querySelector('[aria-label="Mese precedente"]').disabled, true);
  await screen.click(document.querySelector('[aria-label="Mese successivo"]'));
  assert.equal(document.querySelector('[role="grid"]').getAttribute("aria-label"), "novembre 2026");
  assert.equal(document.activeElement.getAttribute("aria-label"), "giovedì 5 novembre 2026");
  assert.equal(document.querySelector('[aria-label="Mese successivo"]').disabled, true);
  await screen.key(document.activeElement, "Escape");
  await screen.change(screen.date, "");
  await screen.change(screen.time, "");
  await screen.rerender({ min: "2028-01-10T19:00", max: "2028-01-15T20:00" });
  await screen.click(screen.trigger);
  assert.equal(document.activeElement.getAttribute("aria-label"), "lunedì 10 gennaio 2028");
  assert.equal(document.activeElement.disabled, false);
});

test("choosing a date for an empty field focuses its clock; disabled controls do not open", async (context) => {
  const screen = await mount(context, "");
  await screen.click(screen.trigger);
  const day = document.querySelector('[role="grid"] button:not([disabled])');
  await screen.click(day);
  assert.equal(document.activeElement, screen.time);
  assert.equal(screen.time.required, true);
  await screen.rerender({ disabled: true });
  assert.equal(screen.date.matches(":disabled"), true);
  assert.equal(screen.trigger.disabled, true);
  await screen.click(screen.trigger);
  assert.equal(document.querySelector('[role="grid"]'), null);
});

test("a calendar inside a native dialog stays in that dialog's top layer", async (context) => {
  const screen = await mount(context, "2026-10-19T18:30", {}, true);
  await screen.click(screen.trigger);
  const grid = screen.host.querySelector('[role="grid"]');
  assert.ok(grid);
  assert.equal(grid.closest("dialog")?.tagName, "DIALOG");
  await screen.click(grid.querySelector('[aria-label="martedì 20 ottobre 2026"]'));
  assert.equal(screen.changes.at(-1), "2026-10-20T18:30");
});
