import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin", pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
  this.querySelector("[autofocus],button,input,a")?.focus();
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event("close"));
};
class FixedDate extends Date { constructor(value) { super(value ?? "2026-10-21T22:30:00Z"); } }
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Date: FixedDate, Intl, window: dom.window, require: name => name in mocks ? mocks[name] : require(name) });
  return compiled.exports;
}
const styles = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
async function mount(context, pathname = "/admin/eventi") {
  const routes = [];
  const routing = {
    usePathname: () => pathname,
    Link: ({ children, onClick, ...props }) => { delete props.prefetch; return React.createElement("a", { ...props, onClick(event) { event.preventDefault(); onClick?.(event); routes.push(props.href); } }, children); },
  };
  const { AdminShell } = load("components/admin/admin-shell.tsx", {
    "@/i18n/routing": routing,
    "next/image": { __esModule: true, default: input => { const props = { ...input }; delete props.unoptimized; return React.createElement("img", props); } },
    "./admin-shell.module.css": styles,
  });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const props = { fullName: "Ada Rossi", email: "ada@example.test", role: "editor", dateLabel: "22 ottobre 2026" };
  const render = async route => { pathname = route; await act(async () => root.render(React.createElement(AdminShell, props, React.createElement("p", null, "Contenuto privato")))); };
  await render(pathname);
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const click = async (selector, scope = host) => {
    const element = scope.querySelector(selector); assert.ok(element, `Missing ${selector}`);
    await act(async () => element.click()); return element;
  };
  const change = async (field, value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  return { host, render, click, change, routes };
}

test("admin navigation marks the correct section and names nested event pages in its breadcrumb", async context => {
  const ui = await mount(context);
  for (const [path, active, label] of [["/admin", "/admin", "Dashboard"], ["/admin/eventi/nuovo", "/admin/eventi", "Nuovo evento"], ["/admin/eventi/event-id/commerce", "/admin/eventi", "Formule e prezzi"], ["/admin/eventi/event-id/statistiche", "/admin/eventi", "Statistiche evento"], ["/admin/affiliati/person-id", "/admin/affiliati", "Affiliati"], ["/admin/contatti", "/admin/contatti", "Contatti e consensi"]]) {
    await ui.render(path);
    const current = ui.host.querySelectorAll('nav[aria-label="Amministrazione"] a[aria-current="page"]');
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute("href"), active);
    assert.equal(ui.host.querySelector('nav[aria-label="Percorso"] > span').textContent, label);
    assert.equal(ui.host.querySelector('nav[aria-label="Navigazione amministrazione mobile"] a[aria-current="page"]').getAttribute("href"), active);
  }
  assert.equal(ui.host.querySelector('a[href="#meraki-admin-content"]').textContent, "Vai al contenuto");
  assert.equal(ui.host.querySelector("main").tabIndex, -1);
  assert.ok(ui.host.textContent.includes("Contenuto privato"));
  const publicLink = ui.host.querySelector('a[aria-label="Apri sito pubblico in una nuova scheda"]');
  assert.equal(publicLink.getAttribute("rel"), "noopener noreferrer");
  assert.equal(publicLink.getAttribute("target"), "_blank");
  assert.equal(ui.host.querySelector('form[action="/auth/signout"]').getAttribute("method"), "post");
});

test("the mobile menu opens, keeps clicks inside, closes on navigation/backdrop and restores its trigger focus", async context => {
  const ui = await mount(context, "/admin/biglietti");
  const drawer = ui.host.querySelector('dialog[aria-label="Menu amministrazione"]');
  assert.equal(drawer.open, false);
  const trigger = await ui.click('button[aria-label="Apri menu amministrazione"]');
  assert.equal(drawer.open, true);
  await act(async () => drawer.firstElementChild.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  assert.equal(drawer.open, true);
  await ui.click('a[href="/admin/affiliati"]', drawer);
  assert.equal(drawer.open, false);
  assert.equal(ui.routes.at(-1), "/admin/affiliati");
  assert.equal(document.activeElement, trigger);
  await ui.click('button[aria-label="Apri menu amministrazione"]');
  await ui.click('button[aria-label="Chiudi menu"]', drawer);
  assert.equal(drawer.open, false);
  assert.equal(document.activeElement, trigger);
  await ui.click('button[aria-label="Apri menu amministrazione"]');
  await act(async () => drawer.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  assert.equal(drawer.open, false);
  assert.equal(document.activeElement, trigger);
});

test("section search matches accents and hints, handles no results and resets when a destination is chosen", async context => {
  const ui = await mount(context);
  const trigger = await ui.click('button[aria-label="Cerca una sezione del pannello"]');
  const dialog = ui.host.querySelector('dialog[aria-labelledby]');
  const field = dialog.querySelector('input[aria-label="Cerca nel pannello"]');
  assert.equal(dialog.open, true);
  await ui.change(field, "  LOCANDÍNA ");
  assert.deepEqual([...dialog.querySelectorAll("a")].map(link => link.getAttribute("href")), ["/admin/eventi"]);
  await ui.change(field, "newsletter");
  assert.equal(dialog.querySelector("a").getAttribute("href"), "/admin/contatti");
  await ui.change(field, "nessuna-sezione-123");
  assert.ok(dialog.querySelector('[role="status"]').textContent.includes("Nessuna sezione trovata"));
  assert.equal(dialog.querySelectorAll("a").length, 0);
  await ui.change(field, "scanner");
  await ui.click('a[href="/admin/biglietti"]', dialog);
  assert.equal(dialog.open, false);
  assert.equal(ui.routes.at(-1), "/admin/biglietti");
  assert.equal(document.activeElement, trigger);
  await ui.click('button[aria-label="Cerca una sezione del pannello"]');
  assert.equal(field.value, "");
  assert.ok(dialog.querySelectorAll("a").length > 1);
  const cancellation = new dom.window.Event("cancel", { cancelable: true });
  await act(async () => { if (dialog.dispatchEvent(cancellation)) dialog.close(); });
  assert.equal(cancellation.defaultPrevented, false, "the native Escape cancellation remains available");
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
});

function layoutFixture({ user = null, profile = null } = {}) {
  const calls = [];
  const redirect = path => { const error = new Error(`Redirect ${path}`); error.destination = path; throw error; };
  const layout = load("app/[locale]/admin/layout.tsx", {
    "next/navigation": { redirect },
    "@/components/admin/admin-shell": { AdminShell: () => null },
    "@/lib/supabase/server": {
      createClient: async () => { calls.push(["session-client"]); return { auth: { getUser: async () => { calls.push(["getUser"]); return { data: { user } }; } } }; },
      createAdminClient: () => { calls.push(["admin-client"]); return { from(table) { calls.push(["table", table]); return { select(columns) { calls.push(["select", columns]); return this; }, eq(key, value) { calls.push(["eq", key, value]); return this; }, async single() { return { data: profile }; } }; } }; },
    },
  }).default;
  return { calls, render: locale => layout({ params: Promise.resolve({ locale }), children: React.createElement("div", null, "Privato") }) };
}

test("server admin layout sends anonymous users to localized login before creating a privileged client", async () => {
  const fixture = layoutFixture();
  await assert.rejects(fixture.render("de"), error => error.destination === "/de/login");
  assert.deepEqual(fixture.calls, [["session-client"], ["getUser"]]);
});

test("server admin layout rejects missing and non-staff profiles even if user metadata claims admin", async () => {
  for (const profile of [null, { role: "user" }, { role: "member" }, { role: "instructor" }, { role: null }]) {
    const fixture = layoutFixture({ user: { id: "member-id", app_metadata: { role: "admin" } }, profile });
    await assert.rejects(fixture.render("es"), error => error.destination === "/es");
    assert.ok(fixture.calls.some(call => call[0] === "eq" && call[1] === "id" && call[2] === "member-id"));
    assert.deepEqual(fixture.calls.find(call => call[0] === "select"), ["select", "role, full_name, email"]);
  }
});

test("admin/editor shells receive only minimal profile props and an Italian Rome date, never the raw authenticated user", async () => {
  for (const role of ["admin", "editor"]) {
    const fixture = layoutFixture({ user: { id: "staff-id", email: "fallback@example.test", user_metadata: { secret: "do-not-send" }, identities: ["private-provider-data"] }, profile: { role, full_name: "Ada Rossi", email: "staff@example.test", internal_secret: "do-not-send" } });
    const element = await fixture.render("en");
    assert.deepEqual(Object.keys(element.props).sort(), ["children", "dateLabel", "email", "fullName", "role"]);
    assert.equal(element.props.role, role);
    assert.equal(element.props.email, "staff@example.test");
    assert.equal(element.props.fullName, "Ada Rossi");
    assert.equal(element.props.dateLabel, "22 ottobre 2026");
    assert.equal(JSON.stringify(element.props).includes("do-not-send"), false);
    assert.equal(JSON.stringify(element.props).includes("staff-id"), false);
  }
  const fallback = await layoutFixture({ user: { id: "editor", email: "fallback@example.test" }, profile: { role: "editor", full_name: null, email: null } }).render("it");
  assert.equal(fallback.props.fullName, "");
  assert.equal(fallback.props.email, "fallback@example.test");
});
