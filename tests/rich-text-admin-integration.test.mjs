import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { richText } from "./helpers/rich-text-modules.mjs";
import { richTextDynamicFixture } from "./helpers/rich-text-editor-fixture.mjs";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/eventi/nuovo", pretendToBeVisual: true });
const original = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
after(() => { dom.window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });

function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, Date, Intl, URL, Error, window: dom.window, document: dom.window.document, crypto: webcrypto, console, require: (name) => name in mocks ? mocks[name] : name === "@/lib/rich-text" ? richText : name === "@/lib/events/affiliates" ? load("lib/events/affiliates.ts") : require(name) });
  return compiledModule.exports;
}
const CustomSelect = React.forwardRef((props, ref) => React.createElement("select", { ...props, ref }));
CustomSelect.displayName = "RichTextIntegrationSelect";
const elements = load("components/admin/form-elements.tsx", { "@/components/ui/custom-select": { CustomSelect }, "next/dynamic": richTextDynamicFixture });
const config = load("lib/commerce/config.ts");
const logistics = load("lib/events/logistics.ts");
const rome = load("lib/commerce/rome-time.ts");
const i18n = load("lib/i18n-utils.ts");
const eventId = "12345678-1111-4111-8111-123456789abc";
const baseEvent = { id: eventId, titolo: { it: "Evento formattato" }, sottotitolo: null, descrizione: { it: "Testo precedente\nsenza formattazione", en: "<p>Existing <strong>English</strong></p>", de: "", es: "" }, slug: "evento-formattato", tipo: "evento", data_inizio: "2027-08-01T08:30:00.000Z", data_fine: "2027-08-01T10:30:00.000Z", check_in_starts_at: null, prezzo_cents: 3500, capacity: 100, location: "Bolzano", indirizzo: null, copertina_url: null, attivo: false, posti_venduti: 0 };
const copy = (value) => JSON.parse(JSON.stringify(value));

async function mount(context, Component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const input = (labelText) => {
    const label = [...host.querySelectorAll("label")].find((candidate) => candidate.textContent.startsWith(labelText));
    assert.ok(label, `Missing field ${labelText}`);
    return host.querySelector(`[id="${label.htmlFor}"]`);
  };
  const change = async (field, value) => act(async () => {
    Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const click = async (text, scope = host) => {
    const button = [...scope.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === text);
    assert.ok(button, `Missing button ${text}`);
    await act(async () => button.click());
  };
  const language = async (label, code) => {
    const field = input(label);
    const labelNode = host.querySelector(`label[for="${field.id}"]`);
    await click(code, labelNode.parentElement);
  };
  const submit = () => act(async () => host.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  return { host, input, change, click, language, submit };
}

function eventFormFixture({ realLogistics = false } = {}) {
  const saved = [];
  const db = { from(table) { assert.equal(table, "events"); let payload; return { upsert(value) { payload = value; saved.push(copy(value)); return this; }, select() { return this; }, eq() { return this; }, async single() { return { data: { ...payload, id: eventId }, error: null }; } }; } };
  const actions = load("app/api/admin/eventi/actions.ts", { "@/lib/events/logistics": logistics, "@/lib/commerce/config": config, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => db }, "next/cache": { revalidatePath() {} } });
  const DateTimeField = ({ label, value, onChange, required, id }) => React.createElement("label", null, label, React.createElement("input", { id, required, value, onChange: (event) => onChange(event.target.value) }));
  const { EventForm } = load("app/[locale]/admin/eventi/[id]/event-form.tsx", {
    "@/components/admin/form-elements": elements,
    "@/components/admin/date-time-field": { DateTimeField },
    "@/components/admin/wizard-steps": load("components/admin/wizard-steps.tsx"),
    "@/components/admin/event-logistics-editor": realLogistics ? load("components/admin/event-logistics-editor.tsx", { "@/components/admin/form-elements": elements }) : { EventLogisticsEditor: () => null },
    "@/components/admin/poster-upload": { PosterUpload: () => null },
    "@/lib/events/logistics": logistics,
    "@/lib/commerce/config": config,
    "@/lib/commerce/rome-time": rome,
    "@/app/api/admin/eventi/actions": actions,
    "@/components/ui/modal-provider": { useModal: () => ({ showConfirm: async () => false }) },
    "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push() {} }) },
  });
  return { EventForm, saved, actions };
}

const flushFocus = () => act(async () => { await new Promise((resolve) => dom.window.setTimeout(resolve, 0)); });

test("optional event introductions preserve formatted translations through review, editing and server save", async (context) => {
  const { EventForm, saved } = eventFormFixture();
  const screen = await mount(context, EventForm, { initialData: baseEvent });
  const label = "Presentazione breve";
  assert.equal(screen.input(label).hasAttribute("data-rich-text-fixture"), true);
  assert.equal(screen.input(label).value, "", "existing events have no invented introduction");
  const introductions = {
    it: "<h3>VIBRA — One Day Experience</h3><p>Un giorno. <strong>Un’esperienza.</strong></p><p>— Alejandro Angulo</p>",
    en: "<h3>VIBRA — One Day Experience</h3><p>One day. <em>An experience.</em></p><p>— Alejandro Angulo</p>",
    de: "<h3>VIBRA — One Day Experience</h3><p>Ein Tag. <strong>Ein Erlebnis.</strong></p><p>— Alejandro Angulo</p>",
    es: "<h3>VIBRA — One Day Experience</h3><p>Un día. <em>Una experiencia.</em></p><p>— Alejandro Angulo</p>",
  };
  for (const [language, value] of Object.entries(introductions)) {
    await screen.language(label, language);
    await screen.change(screen.input(label), value);
  }
  for (let index = 0; index < 4; index += 1) await screen.click("Avanti");
  const review = screen.host.querySelector("[data-event-introduction-review]");
  assert.ok(review);
  for (const phrase of ["Un giorno.", "One day.", "Ein Tag.", "Un día."]) assert.ok(review.textContent.includes(phrase));
  assert.doesNotMatch(review.textContent, /<strong>|<h3>|<em>/);
  assert.equal(saved.length, 0);
  await screen.click("Modifica dettagli");
  for (const [language, value] of Object.entries(introductions)) {
    await screen.language(label, language);
    assert.equal(screen.input(label).value, value, `${language} introduction remains in its own field`);
  }
  for (let index = 0; index < 4; index += 1) await screen.click("Avanti");
  await screen.submit();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].descrizione_breve, introductions);
  assert.deepEqual(saved[0].descrizione, baseEvent.descrizione, "the separate full description is preserved");
});

test("an oversized hidden translation of the introduction blocks the wizard and focuses its language", async (context) => {
  const { EventForm, saved } = eventFormFixture();
  const italian = "<p>Presentazione italiana.</p>";
  const english = `<p>${"x".repeat(3001)}</p>`;
  const screen = await mount(context, EventForm, { initialData: { ...baseEvent, descrizione_breve: { it: italian, en: english } } });
  const label = "Presentazione breve";
  assert.equal(screen.input(label).value, italian);
  await screen.click("Avanti");
  await flushFocus();
  assert.equal(screen.host.querySelector('[data-event-step="0"]').hidden, false);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /presentazione breve è troppo lunga/);
  assert.equal(screen.input(label).value, english);
  assert.equal(screen.input(label).closest("[data-multilingual-field]").querySelector('button[aria-pressed="true"]').textContent, "en");
  assert.equal(document.activeElement, screen.input(label));
  assert.equal(saved.length, 0);
  await screen.change(screen.input(label), "<p>A shorter introduction.</p>");
  await screen.language(label, "it");
  assert.equal(screen.input(label).value, italian);
  await screen.click("Avanti");
  assert.equal(screen.host.querySelector('[data-event-step="1"]').hidden, false);
});

test("introduction server validation accepts optional data and rejects malformed or oversized copies before saving", async () => {
  for (const [value, expected] of [
    [undefined, undefined], [null, null], ["", null], [{ it: "<p><br></p>", en: "" }, null],
    ["Testo semplice", { it: "Testo semplice" }],
    [{ it: "<p>Italiano</p>", en: "<p>English</p>", de: "<p>Deutsch</p>", es: "<p>Español</p>" }, { it: "<p>Italiano</p>", en: "<p>English</p>", de: "<p>Deutsch</p>", es: "<p>Español</p>" }],
  ]) {
    const { actions, saved } = eventFormFixture();
    const payload = { ...baseEvent, ...(value === undefined ? {} : { descrizione_breve: value }) };
    assert.equal((await actions.upsertEvent(payload)).success, true);
    assert.deepEqual(saved[0].descrizione_breve, expected);
    assert.deepEqual(saved[0].descrizione, baseEvent.descrizione);
  }
  for (const value of [[], 42, { it: 42 }, { fr: "Unexpected language" }, { en: "x".repeat(3001) }, { it: "<span></span>".repeat(3000) }]) {
    const { actions, saved } = eventFormFixture();
    const result = await actions.upsertEvent({ ...baseEvent, descrizione_breve: value });
    assert.equal(result.success, false);
    assert.match(result.error, /presentazione breve/);
    assert.equal(saved.length, 0);
  }
});

test("formatted event descriptions retain every language through the full wizard and server save", async (context) => {
  const { EventForm, saved } = eventFormFixture();
  const screen = await mount(context, EventForm, { initialData: baseEvent });
  const label = "Descrizione Completa";
  assert.equal(screen.input(label).hasAttribute("data-rich-text-fixture"), true, "the event description opts into the visual editor");
  assert.equal(screen.input(label).value, baseEvent.descrizione.it, "mounting the form does not silently change a legacy description");
  const descriptions = {
    it: '<h2>Programma &amp; informazioni</h2><p><strong>Workshop</strong> e <em>masterclass</em>.</p><ul><li>Porta acqua</li></ul>',
    en: '<p><strong>Workshop</strong> and <em>masterclass</em>.</p>',
    de: '<p><u>Wichtige Informationen</u></p><ol><li>Wasser mitbringen</li></ol>',
    es: '<p><a href="https://meraki.test/info">Información</a> y <s>precio anterior</s>.</p>',
  };
  for (const [code, value] of Object.entries(descriptions)) {
    await screen.language(label, code);
    await screen.change(screen.input(label), value);
  }
  assert.equal(saved.length, 0);
  for (let index = 0; index < 4; index += 1) await screen.click("Avanti");
  const review = screen.host.querySelector('[data-event-step="4"]');
  assert.equal(review.hidden, false);
  assert.match(review.textContent, /Programma & informazioni/);
  assert.doesNotMatch(review.textContent, /&amp;|<strong>/);
  await screen.click("Modifica dettagli");
  for (const [code, value] of Object.entries(descriptions)) {
    await screen.language(label, code);
    assert.equal(screen.input(label).value, value, `the ${code} formatted draft survives navigating back`);
  }
  for (let index = 0; index < 4; index += 1) await screen.click("Avanti");
  assert.equal(saved.length, 0, "only the final confirmation can save");
  await screen.submit();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].descrizione, descriptions);
  assert.equal(saved[0].attivo, false, "formatting does not publish an existing draft");
  assert.equal(saved[0].data_inizio, baseEvent.data_inizio);
});

test("an invalid foreign description blocks the wizard even while Italian is selected and focuses the correct language", async (context) => {
  for (const invalidText of [`<p>${"x".repeat(20001)}</p>`, "<strong></strong>".repeat(10050)]) {
    const { EventForm, saved } = eventFormFixture();
    const italian = "<p>Descrizione italiana <strong>da conservare</strong>.</p>";
    const screen = await mount(context, EventForm, { initialData: { ...baseEvent, descrizione: { ...baseEvent.descrizione, it: italian, en: invalidText } } });
    const label = "Descrizione Completa";
    assert.equal(screen.input(label).value, italian);
    await screen.click("Avanti");
    await flushFocus();
    assert.equal(screen.host.querySelector('[data-event-step="0"]').hidden, false);
    assert.match(screen.host.querySelector('[role="alert"]').textContent, /descrizione è troppo lunga/);
    const wrapper = screen.input(label).closest("[data-multilingual-field]");
    assert.equal([...wrapper.querySelectorAll('button[aria-pressed="true"]')].find((button) => button.textContent === "en")?.textContent, "en");
    assert.equal(screen.input(label).value, invalidText);
    assert.equal(document.activeElement, screen.input(label), "focus follows the language change after the editor remount");
    await screen.change(screen.input(label), "<p>Shorter <em>English</em> description.</p>");
    await screen.language(label, "it");
    assert.equal(screen.input(label).value, italian, "validation never replaces the Italian draft with another language");
    await screen.click("Avanti");
    assert.equal(screen.host.querySelector('[data-event-step="1"]').hidden, false);
    assert.equal(saved.length, 0);
  }
});

test("a logistics error in another language reopens that language and keeps the corrected text in its own field", async (context) => {
  const { EventForm, saved } = eventFormFixture({ realLogistics: true });
  const screen = await mount(context, EventForm, { initialData: baseEvent });
  for (let index = 0; index < 3; index += 1) await screen.click("Avanti");
  const label = "Contatto per viaggio e soggiorno";
  const english = `<p>${"x".repeat(1001)}</p>`;
  await screen.language(label, "en");
  await screen.change(screen.input(label), english);
  await screen.language(label, "it");
  const italian = "<p>Contatta <strong>Meraki</strong>.</p>";
  await screen.change(screen.input(label), italian);
  await screen.click("Avanti");
  await flushFocus();
  assert.equal(screen.host.querySelector('[data-event-step="3"]').hidden, false);
  assert.match(screen.host.querySelector('[role="alert"]').textContent, /Contatto per viaggio e soggiorno/);
  assert.equal(screen.input(label).value, english);
  const wrapper = screen.input(label).closest("[data-multilingual-field]");
  assert.equal(wrapper.querySelector('button[aria-pressed="true"]').textContent, "en");
  assert.equal(document.activeElement, screen.input(label));
  await screen.change(screen.input(label), "<p>Contact <strong>Meraki</strong>.</p>");
  await screen.language(label, "it");
  assert.equal(screen.input(label).value, italian);
  await screen.click("Avanti");
  assert.equal(screen.host.querySelector('[data-event-step="4"]').hidden, false);
  assert.equal(saved.length, 0);
});

test("course full descriptions support rich text while the card preview stays plain", async (context) => {
  const saved = [];
  const { CourseForm } = load("app/[locale]/admin/corsi/[id]/course-form.tsx", {
    "@/components/admin/form-elements": elements,
    "@/app/api/admin/corsi/actions": { upsertCourse: async (payload) => { saved.push(copy(payload)); return { success: true, id: eventId }; } },
    "@/lib/image-utils": { compressImageToWebp: async () => { throw Error("No upload expected"); } },
    "@/app/api/admin/upload/actions": { uploadImageAction: async () => { throw Error("No upload expected"); } },
    "@/components/ui/modal-provider": { useModal: () => ({ showAlert() {} }) },
    "next/navigation": { useRouter: () => ({ push() {} }) },
  });
  const originalDescription = { it: "<p>Descrizione <strong>esistente</strong></p>", en: "English plain text", de: "", es: "" };
  const screen = await mount(context, CourseForm, { initialData: { id: eventId, nome: { it: "Yoga" }, slug: "yoga", disciplina: "wellness", descrizione_breve: { it: "Anteprima semplice" }, descrizione_lunga: originalDescription, attivo: false }, instructors: [], locations: [] });
  assert.equal(screen.input("Descrizione Breve").hasAttribute("data-rich-text-fixture"), false);
  assert.equal(screen.input("Descrizione Completa").hasAttribute("data-rich-text-fixture"), true);
  await screen.language("Descrizione Completa", "es");
  const spanish = "<h3>Una experiencia</h3><p>Práctica <em>consciente</em>.</p>";
  await screen.change(screen.input("Descrizione Completa"), spanish);
  await screen.submit();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].descrizione_completa, { ...originalDescription, es: spanish });
  assert.deepEqual(saved[0].descrizione_breve, { it: "Anteprima semplice" });
  assert.equal(saved[0].attivo, false);
});

for (const type of ["evento", "workshop", "masterclass"]) {
  test(`${type} metadata exposes readable localized text without editor HTML or script content`, async () => {
    const descriptions = Object.fromEntries(["it", "en", "de", "es"].map((locale) => [locale, `<h2>${locale} &amp; Meraki</h2><p>Uno <strong>due</strong></p><script>alert('private')</script><ul><li>Tre</li></ul>`]));
    const row = { ...baseEvent, tipo: type, descrizione: descriptions, copertina_url: null };
    const server = { createClient: async () => ({ from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, async single() { return { data: row }; } }; } }) };
    const socialMetadata = load("lib/events/social-metadata.ts", { "@/lib/i18n-utils": i18n, "@/lib/rich-text": richText });
    const page = load(`app/[locale]/(public)/${type === "evento" ? "eventi" : "workshop"}/[slug]/page.tsx`, {
      "@/lib/supabase/server": server,
      "@/lib/events/social-data": { getSocialEvent: async () => row },
      "@/lib/events/canceled-public-event": { getCanceledPublicEvent: async () => null },
      "@/lib/events/cancellation-copy": load("lib/events/cancellation-copy.ts"),
      "@/components/meraki/canceled-event": { CanceledEvent: () => null },
      "@/lib/events/social-metadata": socialMetadata,
      "@/lib/commerce/config": load("lib/commerce/config.ts"),
      "@/lib/i18n-utils": i18n,
      "@/components/meraki/event-detail": { EventDetail: () => null },
      "@/components/meraki/events-data": {},
      "@/lib/events/logistics": logistics,
      "next/navigation": { notFound() { throw Error("not found"); } },
    });
    for (const locale of ["it", "en", "de", "es"]) {
      const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: row.slug, locale }) });
      assert.equal(metadata.description, `${locale} & Meraki Uno due Tre`);
      assert.equal(metadata.openGraph.description, metadata.description);
      assert.doesNotMatch(metadata.description, /<|>|&amp;|alert|private/);
    }
    row.descrizione = { it: "<p><br></p>" };
    assert.equal((await page.generateMetadata({ params: Promise.resolve({ slug: row.slug, locale: "it" }) })).description, row.titolo.it);
    row.descrizione = { it: `<p>${"a".repeat(250)}</p>` };
    assert.equal((await page.generateMetadata({ params: Promise.resolve({ slug: row.slug, locale: "it" }) })).description.length, 180);
  });
}
