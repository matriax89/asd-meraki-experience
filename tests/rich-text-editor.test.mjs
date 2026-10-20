import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/eventi/nuovo", pretendToBeVisual: true });
const { window } = dom;
const descriptors = new Map();
for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, ShadowRoot: window.ShadowRoot, DOMParser: window.DOMParser, MutationObserver: window.MutationObserver, getComputedStyle: window.getComputedStyle.bind(window), requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const rect = { top: 0, bottom: 20, left: 0, right: 200, width: 200, height: 20, x: 0, y: 0, toJSON() { return {}; } };
window.Range.prototype.getBoundingClientRect = () => rect;
window.Range.prototype.getClientRects = () => [rect];
window.scrollBy = () => {};
window.scrollTo = () => {};
const { createRoot } = await import("react-dom/client");
function compile(path, modules = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, URL, console, MutationObserver: window.MutationObserver, require: (name) => modules[name] || require(name) });
  return exports;
}
const helpers = compile("../src/lib/rich-text.ts");
const { RichTextEditor } = compile("../src/components/admin/rich-text-editor.tsx", { "@/lib/rich-text": helpers, "./rich-text-editor.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } });
after(async () => { await new Promise((resolve) => window.setTimeout(resolve, 30)); window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });

async function setup(context, initial = "Ciao Meraki", props = {}, initiallyDisabledFieldset = false) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const calls = [];
  let setValue, setDisabled, setFieldsetDisabled;
  function Harness() {
    const [value, updateValue] = useState(initial);
    const [disabled, updateDisabled] = useState(false);
    const [fieldsetDisabled, updateFieldsetDisabled] = useState(initiallyDisabledFieldset);
    setValue = updateValue; setDisabled = updateDisabled; setFieldsetDisabled = updateFieldsetDisabled;
    return React.createElement("form", null, React.createElement("fieldset", { disabled: fieldsetDisabled }, React.createElement("label", { id: "description-label", htmlFor: "description" }, "Descrizione"), React.createElement(RichTextEditor, { id: "description", name: "description", "aria-labelledby": "description-label", value, disabled, onChange: (html) => { calls.push(html); updateValue(html); }, ...props })));
  }
  const root = createRoot(window.document.getElementById("root"));
  context.after(async () => { await act(async () => new Promise((resolve) => window.setTimeout(resolve, 20))); await act(async () => root.unmount()); });
  await act(async () => root.render(React.createElement(Harness)));
  const textbox = () => window.document.querySelector('[role="textbox"]');
  const editor = () => textbox().editor;
  const button = (label) => window.document.querySelector(`button[aria-label="${label}"]`);
  const click = async (label) => act(async () => button(label).click());
  const input = () => window.document.querySelector("textarea");
  return { calls, textbox, editor, button, click, input, setValue: async (value) => act(async () => setValue(value)), setDisabled: async (value) => act(async () => setDisabled(value)), setFieldsetDisabled: async (value) => act(async () => setFieldsetDisabled(value)) };
}

test("plain legacy text is escaped, line breaks remain and mounting never overwrites stored content", async (context) => {
  const ui = await setup(context, 'Primo & secondo\n3 < 5\nUltimo "testo"');
  assert.equal(ui.textbox().textContent, 'Primo & secondo3 < 5Ultimo "testo"');
  assert.equal(ui.textbox().querySelectorAll("p").length, 3);
  assert.equal(ui.input().value, 'Primo & secondo\n3 < 5\nUltimo "testo"');
  assert.deepEqual(ui.calls, []);
  assert.equal(ui.textbox().getAttribute("aria-labelledby"), "description-label");
});

test("formatting applies to real selections, writes HTML and keeps selection through controlled renders", async (context) => {
  const ui = await setup(context);
  await act(async () => ui.editor().commands.setTextSelection({ from: 1, to: 5 }));
  await ui.click("Grassetto");
  assert.match(ui.input().value, /<strong>Ciao<\/strong> Meraki/);
  assert.equal(ui.button("Grassetto").getAttribute("aria-pressed"), "true");
  assert.equal(ui.editor().state.selection.from, 1);
  assert.equal(ui.editor().state.selection.to, 5);
  await ui.click("Corsivo");
  await ui.click("Sottolineato");
  await ui.click("Barrato");
  for (const mark of ["strong", "em", "u", "s"]) assert.equal(ui.textbox().querySelector(mark).textContent, "Ciao");
  assert.equal(ui.calls.length, 4);
});

test("headings, lists and quotes have a visible editable preview and clear formatting restores paragraphs", async (context) => {
  const ui = await setup(context);
  await ui.click("Titolo");
  assert.ok(ui.textbox().querySelector("h2"));
  await ui.click("Sottotitolo");
  assert.ok(ui.textbox().querySelector("h3"));
  await ui.click("Elenco puntato");
  assert.ok(ui.textbox().querySelector("ul li"));
  await ui.click("Elenco numerato");
  assert.ok(ui.textbox().querySelector("ol li"));
  await ui.click("Elenco numerato");
  await ui.click("Citazione");
  assert.ok(ui.textbox().querySelector("blockquote"));
  await ui.click("Rimuovi formattazione");
  assert.ok(ui.textbox().querySelector("p"));
  assert.equal(ui.textbox().querySelector("h2,h3,ul,ol,blockquote,strong,em,u,s"), null);
});

test("undo and redo operate on real changes without form submission", async (context) => {
  const ui = await setup(context);
  await act(async () => ui.editor().commands.setTextSelection({ from: 1, to: 5 }));
  await ui.click("Grassetto");
  assert.equal(ui.button("Annulla").disabled, false);
  await ui.click("Annulla");
  assert.equal(ui.textbox().querySelector("strong"), null);
  assert.equal(ui.button("Ripeti").disabled, false);
  await ui.click("Ripeti");
  assert.ok(ui.textbox().querySelector("strong"));
  assert.ok([...window.document.querySelectorAll("button")].every((button) => button.type === "button"));
});

test("external translation changes load silently and subsequent edits preserve the new text", async (context) => {
  const ui = await setup(context, "Italiano");
  await ui.setValue("<p><em>English</em></p>");
  assert.equal(ui.textbox().textContent, "English");
  assert.ok(ui.textbox().querySelector("em"));
  assert.deepEqual(ui.calls, []);
  await act(async () => ui.editor().commands.setTextSelection({ from: 1, to: 8 }));
  await ui.click("Grassetto");
  assert.match(ui.input().value, /English/);
  assert.equal(ui.calls.length, 1);
});

test("inline link editor rejects executable URLs, retains selection and supports adding and removing links", async (context) => {
  const ui = await setup(context);
  await act(async () => ui.editor().commands.setTextSelection({ from: 1, to: 5 }));
  await ui.click("Inserisci o modifica link");
  const linkInput = window.document.querySelector('input[id="description-link"]');
  assert.equal(window.document.activeElement, linkInput);
  async function enterLink(value) {
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(linkInput, value); linkInput.dispatchEvent(new window.Event("input", { bubbles: true })); });
    await act(async () => linkInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  }
  for (const href of ["javascript:alert(1)", "data:text/html,test", "//example.test"]) {
    await enterLink(href);
    assert.match(window.document.querySelector('[role="alert"]').textContent, /link completo/);
    assert.equal(ui.textbox().querySelector("a"), null);
    assert.equal(ui.calls.length, 0);
  }
  await enterLink("https://example.test/info");
  assert.equal(ui.textbox().querySelector("a").textContent, "Ciao");
  assert.equal(ui.textbox().querySelector("a").getAttribute("href"), "https://example.test/info");
  assert.equal(window.document.querySelector('[aria-label="Modifica link"]'), null);
  await ui.click("Rimuovi link");
  assert.equal(ui.textbox().querySelector("a"), null);
});

test("pasted unsupported elements and unsafe links do not survive the editor schema", async (context) => {
  const ui = await setup(context, '<p style="color:red" onclick="alert(1)">Testo <a href="javascript:alert(1)">link</a></p><img src="https://example.test/image.png"><script>alert(1)</script>');
  assert.equal(ui.textbox().querySelector("img,script,[onclick],[style]"), null);
  assert.equal(ui.textbox().querySelector("a"), null);
  await act(async () => ui.editor().commands.insertContent("!"));
  assert.doesNotMatch(ui.input().value, /onclick|javascript:|<script|<img|style=/);
});

test("links can be edited in place and email or telephone links can be inserted without selection", async (context) => {
  const ui = await setup(context, '<p><a href="https://example.test/old">Meraki</a></p>');
  await act(async () => ui.editor().commands.setTextSelection(3));
  await ui.click("Inserisci o modifica link");
  let input = window.document.querySelector('input[id="description-link"]');
  assert.equal(input.value, "https://example.test/old");
  let propagatedEnter = 0;
  window.document.querySelector("form").addEventListener("keydown", () => { propagatedEnter += 1; });
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "mailto:info@example.test"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await act(async () => input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.equal(propagatedEnter, 0);
  assert.equal(ui.textbox().querySelector("a").textContent, "Meraki");
  assert.equal(ui.textbox().querySelector("a").getAttribute("href"), "mailto:info@example.test");
  await ui.setValue("");
  await ui.click("Inserisci o modifica link");
  input = window.document.querySelector('input[id="description-link"]');
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "tel:+390471123456"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await act(async () => input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.equal(ui.textbox().querySelector("a").textContent, "tel:+390471123456");
  assert.equal(ui.textbox().querySelector("a").getAttribute("href"), "tel:+390471123456");
});

test("required and visible text limits validate the real form without counting formatting tags", async (context) => {
  const ui = await setup(context, "<p><strong>Ciao</strong></p>", { required: true, maxLength: 4 });
  assert.equal(ui.input().validity.valid, true);
  assert.equal(new window.FormData(window.document.querySelector("form")).get("description"), "<p><strong>Ciao</strong></p>");
  await ui.setValue("<p><strong>Ciaoo</strong></p>");
  await act(async () => assert.equal(ui.input().checkValidity(), false));
  assert.match(window.document.querySelector('[role="alert"]').textContent, /massimo 4/);
  assert.equal(ui.textbox().getAttribute("aria-invalid"), "true");
  await ui.setValue("<p><br></p>");
  await act(async () => assert.equal(ui.input().checkValidity(), false));
  assert.match(window.document.querySelector('[role="alert"]').textContent, /richiesto/);
  await ui.setValue("<p>Ok</p>");
  assert.equal(ui.input().validity.valid, true);
  assert.equal(window.document.querySelector('[role="alert"]'), null);
});

test("disabled props and ancestor fieldsets lock the contenteditable and every formatting action", async (context) => {
  const ui = await setup(context);
  await ui.setDisabled(true);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "false");
  assert.ok([...window.document.querySelectorAll("button")].every((button) => button.disabled));
  await ui.setDisabled(false);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "true");
  await ui.setFieldsetDisabled(true);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "false");
  await ui.setFieldsetDisabled(false);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "true");
  assert.deepEqual(ui.calls, []);
});

test("initial disabled fieldsets and read-only fields expose no editable textbox", async (context) => {
  const ui = await setup(context, "", { required: true, readOnly: true }, true);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "false");
  assert.equal(ui.textbox().getAttribute("aria-readonly"), "true");
  assert.equal(ui.input().willValidate, false);
  assert.ok([...window.document.querySelectorAll("button")].every((button) => button.disabled));
  assert.deepEqual(ui.calls, []);
});

test("an ancestor fieldset remains locked when the child's own disabled flag is removed", async (context) => {
  const ui = await setup(context, "Testo", {}, true);
  await ui.setDisabled(true);
  await ui.setDisabled(false);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "false");
  assert.ok([...window.document.querySelectorAll("button")].every((button) => button.disabled));
  await ui.setFieldsetDisabled(false);
  assert.equal(ui.textbox().getAttribute("contenteditable"), "true");
  assert.deepEqual(ui.calls, []);
});
