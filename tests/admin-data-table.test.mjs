import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/eventi", pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
after(() => { dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: name => name in mocks ? mocks[name] : require(name) });
  return compiled.exports;
}
const CustomSelect = React.forwardRef((props, ref) => React.createElement("select", { ...props, ref }));
CustomSelect.displayName = "AdminTableSelectFixture";
const view = load("components/admin/data-table-view.tsx", { "@/components/ui/custom-select": { CustomSelect } });
const { DataTable } = load("components/admin/data-table.tsx", { "./data-table-view": view });
const columns = [{ header: "Partecipante", accessorKey: "name" }, { header: "Città", accessorKey: "city", align: "center" }, { header: "Azioni", cell: item => React.createElement("a", { href: `/admin/biglietti/${item.id}`, title: `manage-${item.id}` }, "Gestisci"), align: "right" }];
const people = Array.from({ length: 57 }, (_, index) => ({ id: `person-${index + 1}`, name: index === 0 ? "José Álvarez" : index === 1 ? "Anna Müller" : `Partecipante ${String(index + 1).padStart(2, "0")}`, city: index === 0 ? "Zürich" : "Bolzano", privateNote: "should-never-be-sent" }));
const defaults = { data: people, columns, keyExtractor: person => person.id, pageSize: 10, caption: "Iscritti evento", searchPlaceholder: "Cerca partecipanti" };
async function mount(context, changes = {}) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const render = async props => act(async () => root.render(React.createElement(DataTable, { ...defaults, ...changes, ...props })));
  await render();
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const rows = () => [...host.querySelectorAll("tbody tr")];
  const change = async (field, value) => act(async () => {
    const prototype = field.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
    field.dispatchEvent(new dom.window.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  const click = async selector => { const button = host.querySelector(selector); assert.ok(button); await act(async () => button.click()); };
  return { host, rows, render, change, click, search: value => change(host.querySelector('input[type="search"]'), value) };
}

test("server table cell callbacks are rendered into slots before crossing the client boundary", () => {
  const calls = [];
  const inputColumns = [{ header: "Nome", cell: person => { calls.push(person.id); return React.createElement("strong", { title: "attribute-not-searchable" }, person.name, React.createElement("span", null, " · ", person.city)); } }, { header: "Azioni", cell: person => React.createElement("a", { href: `/admin/people/${person.id}` }, "Apri") }];
  const element = DataTable({ data: people.slice(0, 2), columns: inputColumns, keyExtractor: person => person.id, caption: "Server table", pageSize: 10 });
  assert.deepEqual(calls, ["person-1", "person-2"]);
  assert.equal(element.type, view.DataTableView);
  assert.deepEqual(JSON.parse(JSON.stringify(element.props.columns)), [{ header: "Nome" }, { header: "Azioni" }]);
  assert.equal("data" in element.props, false);
  assert.equal("keyExtractor" in element.props, false);
  assert.equal(element.props.rows[0].id, "person-1");
  assert.ok(element.props.rows[0].searchText.includes("José Álvarez"));
  assert.ok(element.props.rows[0].searchText.includes("Zürich"));
  assert.equal(element.props.rows[0].searchText.includes("attribute-not-searchable"), false);
  assert.equal(JSON.stringify(element.props).includes("should-never-be-sent"), false);
  const fragment = JSDOM.fragment(renderToStaticMarkup(element));
  assert.equal(fragment.querySelector("caption").textContent, "Server table");
  assert.equal(fragment.querySelector("tbody strong").textContent, "José Álvarez · Zürich");
  assert.equal(fragment.querySelector("tbody a").getAttribute("href"), "/admin/people/person-1");
});

test("table search is accent/case insensitive and clearing restores the first page and action links", async context => {
  const ui = await mount(context);
  assert.equal(ui.rows().length, 10);
  assert.equal(ui.host.querySelector("caption").textContent, "Iscritti evento");
  assert.ok([...ui.host.querySelectorAll("thead th")].every(header => header.getAttribute("scope") === "col"));
  await ui.click('button[aria-label="Pagina successiva"]');
  assert.ok(ui.rows()[0].textContent.includes("Partecipante 11"));
  await ui.search("  JOSE ALVAREZ  ");
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.rows()[0].textContent.includes("José Álvarez"));
  assert.ok(ui.host.textContent.includes("1 risultato su 57"));
  assert.ok(ui.host.textContent.includes("1–1 di 1"));
  assert.equal(ui.rows()[0].querySelector("a").getAttribute("href"), "/admin/biglietti/person-1");
  await ui.search("zurich");
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.rows()[0].textContent.includes("José Álvarez"));
  await ui.search("MULLER");
  assert.ok(ui.rows()[0].textContent.includes("Anna Müller"));
  await ui.click('button[aria-label="Cancella ricerca"]');
  assert.equal(ui.host.querySelector('input[type="search"]').value, "");
  assert.equal(ui.rows().length, 10);
  assert.ok(ui.rows()[0].textContent.includes("José Álvarez"));
  assert.equal(ui.host.querySelector('button[aria-label="Pagina precedente"]').disabled, true);
});

test("pagination bounds, page size changes and shrinking datasets never show an empty phantom page", async context => {
  const ui = await mount(context);
  const next = 'button[aria-label="Pagina successiva"]';
  const previous = 'button[aria-label="Pagina precedente"]';
  assert.equal(ui.host.querySelector(previous).disabled, true);
  for (let page = 1; page < 6; page += 1) await ui.click(next);
  assert.equal(ui.rows().length, 7);
  assert.ok(ui.host.textContent.includes("51–57 di 57"));
  assert.equal(ui.host.querySelector(next).disabled, true);
  await ui.click(previous);
  assert.ok(ui.rows()[0].textContent.includes("Partecipante 41"));
  await ui.change(ui.host.querySelector('select[aria-label="Risultati per pagina"]'), "25");
  assert.equal(ui.rows().length, 25);
  assert.ok(ui.host.textContent.includes("1–25 di 57"));
  assert.equal(ui.host.querySelector(previous).disabled, true);
  await ui.click(next); await ui.click(next);
  assert.equal(ui.rows().length, 7);
  await ui.render({ data: people.slice(0, 3) });
  assert.equal(ui.rows().length, 3);
  assert.ok(ui.host.textContent.includes("1–3 di 3"));
  assert.equal(ui.host.querySelector(next).disabled, true);
  assert.equal(ui.host.querySelector(previous).disabled, true);
});

test("empty data and a no-match search have distinct states with usable reset controls", async context => {
  const ui = await mount(context);
  await ui.search("no matching participant");
  assert.ok(ui.host.textContent.includes("Nessun risultato per questa ricerca."));
  assert.ok(ui.host.textContent.includes("0 risultati"));
  assert.equal(ui.host.querySelector("tbody td").getAttribute("colspan"), "3");
  assert.equal(ui.host.querySelector('button[aria-label="Pagina successiva"]').disabled, true);
  await ui.click('button[aria-label="Cancella ricerca"]');
  assert.equal(ui.rows().length, 10);
  await ui.render({ data: [] });
  assert.ok(ui.host.textContent.includes("Non ci sono ancora dati da mostrare."));
  assert.equal(ui.host.textContent.includes("Nessun risultato per questa ricerca."), false);
});

test("searchable=false omits duplicate search while preserving pagination and interactive client actions", async context => {
  const actions = [];
  const ui = await mount(context, { searchable: false, columns: [{ header: "Nome", accessorKey: "name" }, { header: "Azione", cell: person => React.createElement("button", { type: "button", onClick: () => actions.push(person.id) }, "Registra") }] });
  assert.equal(ui.host.querySelector('input[type="search"]'), null);
  assert.equal(ui.rows().length, 10);
  await act(async () => ui.rows()[0].querySelector("button").click());
  assert.deepEqual(actions, ["person-1"]);
  await ui.click('button[aria-label="Pagina successiva"]');
  await act(async () => ui.rows()[0].querySelector("button").click());
  assert.deepEqual(actions, ["person-1", "person-11"]);
  assert.ok(ui.host.textContent.includes("11–20 di 57"));
});

test("search indexes only the selected status of a controlled CustomSelect, not every available option", async context => {
  const statuses = [{ value: "nuovo", label: "Nuovo" }, { value: "contattato", label: "Contattato" }, { value: "archiviato", label: "Archiviato" }];
  const stateColumns = [{ header: "Partecipante", accessorKey: "name" }, { header: "Stato", cell: person => React.createElement(CustomSelect, { value: person.status, onChange() {}, "aria-label": "Stato richiesta" }, statuses.map(status => React.createElement("option", { key: status.value, value: status.value }, status.label))) }];
  const ui = await mount(context, { data: [{ ...people[0], status: "nuovo" }, { ...people[1], status: "archiviato" }], columns: stateColumns });
  await ui.search("ARCHIVIATO");
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.rows()[0].textContent.includes("Anna Müller"));
  assert.equal(ui.host.querySelector("tbody").textContent.includes("José Álvarez"), false);
  await ui.search("nuovo");
  assert.equal(ui.rows().length, 1);
  assert.ok(ui.rows()[0].textContent.includes("José Álvarez"));
  assert.equal(ui.host.querySelector("tbody").textContent.includes("Anna Müller"), false);
  await ui.search("contattato");
  assert.ok(ui.host.querySelector("tbody").textContent.includes("Nessun risultato per questa ricerca."));
});

test("server-rendered default select values index their displayed label while leaving choice lists out of search", () => {
  const element = DataTable({ data: people.slice(0, 1), keyExtractor: person => person.id, columns: [{ header: "Stato", cell: () => React.createElement("select", { defaultValue: "archiviato" }, React.createElement("option", { value: "nuovo" }, "Nuovo"), React.createElement("option", { value: "archiviato" }, "Archiviato")) }] });
  assert.equal(element.props.rows[0].searchText.includes("Archiviato"), true);
  assert.equal(element.props.rows[0].searchText.includes("Nuovo"), false);
});
