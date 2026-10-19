import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { after } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: "https://meraki.test", pretendToBeVisual: true });
const { window } = dom;
const original = new Map();
class ResizeObserverFixture { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = ResizeObserverFixture;
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Document: window.Document, MutationObserver: window.MutationObserver, ResizeObserver: ResizeObserverFixture, getComputedStyle: window.getComputedStyle.bind(window), requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true })) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => { window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function compile(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports, Event: window.Event, console, require: (name) => name in mocks ? mocks[name] : name.endsWith(".module.css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } : require(name) });
  return exports;
}
const { CustomSelect } = compile("../src/components/ui/custom-select.tsx");
const { EuroInput } = compile("../src/components/admin/euro-input.tsx");
async function mount(context, component) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(component));
  context.after(async () => { await act(async () => root.unmount()); });
  return window.document.getElementById("root");
}
async function inputValue(input, value) { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); }); }
async function click(element) {
  assert.ok(element);
  await act(async () => {
    element.focus();
    if (element.getAttribute("role") === "option") {
      const pointer = new window.MouseEvent("pointerdown", { bubbles: true });
      Object.defineProperty(pointer, "pointerType", { value: "touch" });
      element.dispatchEvent(pointer);
    }
    element.click();
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  assert.ok(predicate(), "The popup finishes its animation and registers its options");
}

test("custom select emits real select change events and preserves form value and labels", async (context) => {
  const changes = [];
  function Form() {
    const [value, setValue] = React.useState("workshop");
    return React.createElement("form", null, React.createElement("label", { htmlFor: "formula" }, "Formula"), React.createElement(CustomSelect, { id: "formula", name: "formula", value, onChange: (event) => { changes.push(event.target.value); setValue(event.target.value); } }, React.createElement("option", { value: "workshop" }, "Solo Workshop"), React.createElement("option", { value: "bundle" }, "Workshop + Masterclass")));
  }
  const container = await mount(context, React.createElement(Form));
  const button = container.querySelector("button#formula");
  assert.equal(button.getAttribute("role"), "combobox");
  assert.match(button.textContent, /Solo Workshop/);
  const hidden = container.querySelector("select");
  assert.equal(hidden.getAttribute("aria-hidden"), "true");
  await act(async () => { hidden.value = "bundle"; hidden.dispatchEvent(new window.Event("change", { bubbles: true })); });
  assert.deepEqual(changes, ["bundle"]);
  assert.match(button.textContent, /Workshop \+ Masterclass/);
  assert.equal(new window.FormData(container.querySelector("form")).get("formula"), "bundle");
});

test("custom select respects disabled and consumed options", async (context) => {
  const container = await mount(context, React.createElement(CustomSelect, { id: "activity", disabled: true, value: "workshop", "aria-label": "Attività" }, React.createElement("option", { value: "workshop", disabled: true }, "Workshop · già utilizzato"), React.createElement("option", { value: "dinner" }, "Cena")));
  assert.equal(container.querySelector("button").disabled, true);
  assert.equal(container.querySelector("select").disabled, true);
  assert.equal(container.querySelector('option[value="workshop"]').disabled, true);
});

test("the real custom popup skips consumed options and emits the named native select event", async (context) => {
  const changes = [];
  function Form() {
    const [value, setValue] = React.useState("workshop");
    return React.createElement("form", null, React.createElement(CustomSelect, { id: "activity-popup", name: "activity", value, "aria-label": "Attività", onChange(event) {
      changes.push({ value: event.target.value, nativeSelect: event.target instanceof window.HTMLSelectElement, name: event.target.name });
      setValue(event.target.value);
    } }, React.createElement("option", { value: "workshop", disabled: true }, "Workshop · già utilizzato"), React.createElement("option", { value: "dinner" }, "Cena")));
  }
  const container = await mount(context, React.createElement(Form));
  const trigger = container.querySelector('[role="combobox"]');
  await click(trigger);
  await waitFor(() => window.document.querySelector('[role="option"][aria-disabled="true"]'));
  const disabled = window.document.querySelector('[role="option"][aria-disabled="true"]');
  assert.match(disabled.textContent, /già utilizzato/);
  await click(disabled);
  assert.deepEqual(changes, []);
  const available = [...window.document.querySelectorAll('[role="option"]')].find((item) => item.textContent === "Cena");
  await click(available);
  assert.deepEqual(changes, [{ value: "dinner", nativeSelect: true, name: "activity" }]);
  assert.match(trigger.textContent, /Cena/);
  assert.equal(new window.FormData(container.querySelector("form")).get("activity"), "dinner");
  assert.equal(window.document.querySelector('[role="combobox"]').getAttribute("aria-expanded"), "false");
});

test("the custom popup returns keyboard focus on Escape", async (context) => {
  const options = [React.createElement("option", { key: "a", value: "a" }, "Workshop"), React.createElement("option", { key: "b", value: "b" }, "Cena")];
  const container = await mount(context, React.createElement(CustomSelect, { id: "keyboard-select", value: "a", "aria-label": "Attività" }, options));
  const trigger = container.querySelector('[role="combobox"]');
  await click(trigger);
  await waitFor(() => window.document.querySelector('[role="listbox"]'));
  assert.ok(window.document.querySelector('[role="listbox"]'));
  await act(async () => { window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  assert.equal(window.document.querySelector('[role="combobox"]').getAttribute("aria-expanded"), "false");
  assert.equal(window.document.activeElement.id, trigger.id);
});

test("the custom popup stays closed while disabled", async (context) => {
  const disabledContainer = await mount(context, React.createElement(CustomSelect, { id: "disabled-select", disabled: true, value: "a", "aria-label": "Attività" }, React.createElement("option", { value: "a" }, "Workshop")));
  await click(disabledContainer.querySelector('[role="combobox"]'));
  assert.equal(window.document.querySelector('[role="combobox"]').getAttribute("aria-expanded"), "false");
});

test("Italian money input accepts decimal comma without changing cents or rounding during typing", async (context) => {
  const changes = [];
  function Form() { const [cents, setCents] = React.useState(3000); return React.createElement(EuroInput, { cents, required: true, onCentsChange: (value) => { changes.push(value); setCents(value); } }); }
  const container = await mount(context, React.createElement(Form));
  const input = container.querySelector("input");
  assert.equal(input.value, "30,00");
  await act(async () => input.focus());
  await inputValue(input, "35,");
  assert.equal(input.value, "35,");
  await inputValue(input, "35,50");
  assert.equal(changes.at(-1), 3550);
  await act(async () => input.blur());
  assert.equal(input.value, "35,50");
  assert.equal(input.checkValidity(), true);
});

test("Italian money input prevents invalid, negative and over-limit amounts", async (context) => {
  const changes = [];
  const container = await mount(context, React.createElement(EuroInput, { cents: 3000, required: true, onCentsChange: (value) => changes.push(value) }));
  const input = container.querySelector("input");
  await act(async () => input.focus());
  for (const value of ["-1", "1,234", "100001", "ciao"]) { await inputValue(input, value); assert.equal(input.checkValidity(), false, value); }
  assert.deepEqual(changes, []);
  await inputValue(input, "12.50");
  assert.equal(changes.at(-1), 1250);
  assert.equal(input.checkValidity(), true);
});

test("refocusing a rejected money draft preserves it until explicitly corrected", async (context) => {
  const container = await mount(context, React.createElement(EuroInput, { cents: 3000, required: true, onCentsChange() {} }));
  const input = container.querySelector("input");
  await act(async () => input.focus());
  await inputValue(input, "1,234");
  assert.equal(input.checkValidity(), false);
  await act(async () => input.blur());
  await act(async () => input.focus());
  assert.equal(input.value, "1,234");
  assert.equal(input.checkValidity(), false);
  await inputValue(input, "30,00");
  assert.equal(input.checkValidity(), true);
});

test("an unchanged commerce date preserves an existing repeated-hour instant with seconds", async (context) => {
  const { DateTimeField } = compile("../src/components/admin/date-time-field.tsx");
  const rome = compile("../src/lib/commerce/rome-time.ts");
  const config = compile("../src/lib/commerce/config.ts");
  const saved = [];
  const { CommerceConfigEditor } = compile("../src/components/admin/commerce-config-editor.tsx", {
    "@/components/ui/custom-select": { CustomSelect },
    "@/components/admin/euro-input": { EuroInput },
    "@/components/admin/date-time-field": { DateTimeField },
    "@/lib/commerce/rome-time": rome,
    "@/lib/commerce/config": config,
    "@/app/api/admin/commerce/actions": { saveCommerceAdmin: async (_id, value) => { saved.push(value); return { success: true }; }, updateCommerceWaitlist: async () => ({ success: true }) },
  });
  const instant = "2026-10-25T00:30:45.000Z";
  const initialConfig = { version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [{ id: "workshop", name: "Workshop", kind: "workshop", capacity: null, startsAt: instant, salesEnd: null, menuOptions: [] }], packages: [{ id: "only-ws", name: "Solo Workshop", description: "", activityIds: ["workshop"], prices: [{ id: "standard", label: "Standard", amountCents: 3000, startsAt: null, endsAt: null }] }], addons: [] };
  const stats = { revenueCents: 0, paidOrders: 0, participants: 0, refundedCents: 0, packages: [], tiers: [], addons: [] };
  const container = await mount(context, React.createElement(CommerceConfigEditor, { eventId: "12345678-1111-4111-8111-123456789abc", initialConfig, stats, initialWaitlist: [] }));
  const date = container.querySelector('[aria-label="Data · Inizio attività"]');
  assert.equal(date.value, "25/10/2026");
  await act(async () => date.focus());
  await act(async () => date.blur());
  assert.equal(container.querySelector("form").checkValidity(), true);
  assert.equal(container.querySelector('[role="alert"]'), null);
  await act(async () => container.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].activities[0].startsAt, instant);
});
