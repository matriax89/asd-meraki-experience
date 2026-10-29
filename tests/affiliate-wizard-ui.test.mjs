import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { after } from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/admin/affiliati", pretendToBeVisual: true });
const { window } = dom;
const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, FormData: window.FormData, requestAnimationFrame: window.requestAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map();
for (const [key, value] of Object.entries(globals)) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
after(() => {
  dom.window.close();
  for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
});
function compile(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, console, document: window.document, requestAnimationFrame: window.requestAnimationFrame.bind(window), require: name => name in mocks ? mocks[name] : ["./affiliate-commissions", "@/lib/events/affiliate-commissions"].includes(name) ? compile("lib/events/affiliate-commissions.ts") : require(name) });
  return loaded.exports;
}
const eventA = { id: "b44b9ba0-11cc-4da7-80d0-a3acf193c379", title: "Meraki Inverno", startsAt: "2026-12-19T23:30:00Z" };
const eventB = { id: "c732f0f8-fb0d-45fe-8e49-cdc1d8cc8d02", title: "Meraki Estate", startsAt: "2027-06-01T10:00:00Z" };
const existing = { id: "8af0ff53-de24-43b5-a8f0-1c29d11ca936", name: "Scuola Aurora", createdAt: "2026-10-26", contactName: "Maria Rossi", email: "maria@example.test", phone: "+393331234567", notes: "Accordo annuale", defaultCommissionCents: 500, deletedAt: null };
const eurRate = (eventId, commissionCents) => ({ eventId, commissionType: "eur", commissionCents, commissionCredits: 0 });
const creditsRate = (eventId, commissionCredits) => ({ eventId, commissionType: "credits", commissionCents: 0, commissionCredits });
async function setup(context, props = {}, handlers = {}) {
  window.document.body.innerHTML = '<div id="root"></div>';
  const calls = [];
  const saved = [];
  const cancel = [];
  const schema = compile("lib/events/affiliate-profile-schema.ts");
  const { AffiliateWizard } = compile("components/admin/affiliate-wizard.tsx", {
    "@/app/api/admin/affiliati/actions": {
      createAffiliate: async input => { calls.push(["create", input]); return handlers.create ? handlers.create(input) : { success: true, affiliate: { ...existing, ...input } }; },
      updateAffiliate: async (id, input) => { calls.push(["update", id, input]); return handlers.update ? handlers.update(id, input) : { success: true, affiliate: { ...existing, ...input } }; },
    },
    "@/components/admin/wizard-steps": compile("components/admin/wizard-steps.tsx"),
    "@/components/admin/affiliate-commission-input": compile("components/admin/affiliate-commission-input.tsx"),
    "@/lib/events/affiliate-commissions": compile("lib/events/affiliate-commissions.ts"),
    "@/lib/events/affiliate-profile-schema": schema,
  });
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(AffiliateWizard, { events: [eventA, eventB], onSaved: entry => saved.push(entry), onCancel: () => cancel.push(true), ...props })));
  context.after(async () => { await act(async () => root.unmount()); });
  const button = text => [...window.document.querySelectorAll("button")].find(element => element.textContent.trim() === text);
  const click = async text => { const element = button(text); assert.ok(element, `button ${text}`); await act(async () => element.click()); };
  const field = text => {
    const label = [...window.document.querySelectorAll("label")].find(element => element.textContent.startsWith(text));
    assert.ok(label, `field ${text}`);
    return window.document.getElementById(label.htmlFor);
  };
  const fill = async (text, value) => {
    const input = field(text);
    await act(async () => { Object.getOwnPropertyDescriptor(input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  };
  const toggle = async title => { const element = window.document.querySelector(`input[role="switch"][aria-label="Associa a ${title}"]`); assert.ok(element); await act(async () => element.click()); };
  const unit = async (value, context = "Compenso predefinito") => { const group = [...window.document.querySelectorAll("fieldset")].find(element => element.querySelector("legend")?.textContent === `Tipo di compenso · ${context}`); assert.ok(group, `unit group ${context}`); await act(async () => group.querySelector(`input[value="${value}"]`).click()); };
  return { calls, saved, cancel, button, click, fill, field, toggle, unit };
}

test("new affiliate wizard saves contact data, default and per-event compensation only after final review", async context => {
  const ui = await setup(context);
  await ui.fill("Nome e cognome", "Scuola Nuova");
  await ui.fill("Referente", "Ada Rossi");
  await ui.fill("Email", "ada@example.test");
  await ui.fill("Telefono", "+393331234567");
  await ui.fill("Note interne", "Accordo per la stagione");
  await ui.click("Avanti");
  assert.equal(ui.calls.length, 0);
  await ui.fill("Compenso per iscritto valido", "5,00");
  await ui.click("Avanti");
  await ui.toggle(eventA.title);
  assert.equal(ui.field("Compenso per iscritto (€)").value, "5,00");
  await ui.fill("Compenso per iscritto (€)", "7,50");
  await ui.toggle(eventB.title);
  await ui.fill("Cerca un evento", "estate");
  assert.equal(window.document.querySelectorAll('input[role="switch"]').length, 1);
  await ui.click("Avanti");
  assert.ok(window.document.body.textContent.includes("Scuola Nuova"));
  assert.ok(window.document.body.textContent.includes("ada@example.test"));
  assert.ok(window.document.body.textContent.includes("7,50"));
  assert.ok(window.document.body.textContent.includes(eventA.title));
  assert.ok(window.document.body.textContent.includes(eventB.title));
  assert.equal(ui.calls.length, 0);
  await ui.click("Crea affiliato");
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.saved.length, 1);
  const input = ui.calls[0][1];
  assert.equal(input.defaultCommissionCents, 500);
  assert.equal(input.contactName, "Ada Rossi");
  assert.equal(input.email, "ada@example.test");
  assert.equal(input.phone, "+393331234567");
  assert.equal(input.notes, "Accordo per la stagione");
  assert.deepEqual(JSON.parse(JSON.stringify(input.assignments)), [eurRate(eventA.id, 750), eurRate(eventB.id, 500)]);
});

test("step validation blocks incomplete name, invalid contact and invalid euro amounts without losing input", async context => {
  const ui = await setup(context, { events: [] });
  await ui.click("Avanti");
  assert.ok(window.document.querySelector('[role="alert"]'));
  assert.ok(ui.field("Nome e cognome").getAttribute("aria-invalid") === "true");
  await ui.fill("Nome e cognome", "Scuola Valida");
  await ui.fill("Email", "invalid-email");
  await ui.click("Avanti");
  assert.ok(window.document.querySelector('[role="alert"]'));
  assert.equal(ui.field("Nome e cognome").value, "Scuola Valida");
  await ui.fill("Email", "");
  await ui.click("Avanti");
  await ui.fill("Compenso per iscritto valido", "1,234");
  await ui.click("Avanti");
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("due decimali"));
  await ui.fill("Compenso per iscritto valido", "0,00");
  await ui.click("Avanti");
  assert.ok(window.document.body.textContent.includes("Puoi continuare senza eventi"));
  await ui.click("Avanti");
  await ui.click("Crea affiliato");
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0][1].defaultCommissionCents, 0);
  assert.equal(ui.calls[0][1].assignments.length, 0);
});

test("editing the default does not replace existing event rates and deselecting preserves its remembered override", async context => {
  const ui = await setup(context, { affiliate: existing, assignments: [{ eventId: eventA.id, commissionCents: 700 }] });
  await ui.click("Avanti");
  await ui.fill("Compenso per iscritto valido", "9,00");
  await ui.click("Avanti");
  assert.equal(ui.field("Compenso per iscritto (€)").value, "7,00");
  await ui.toggle(eventA.title);
  await ui.toggle(eventA.title);
  assert.equal(ui.field("Compenso per iscritto (€)").value, "7,00");
  await ui.toggle(eventB.title);
  const amounts = [...window.document.querySelectorAll('input[inputmode="decimal"]')].map(input => input.value);
  assert.deepEqual(amounts, ["7,00", "9,00"]);
  await ui.click("Avanti");
  await ui.click("Salva modifiche");
  assert.equal(ui.calls[0][0], "update");
  assert.equal(ui.calls[0][1], existing.id);
  assert.equal(ui.calls[0][2].defaultCommissionCents, 900);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0][2].assignments)), [eurRate(eventA.id, 700), eurRate(eventB.id, 900)]);
});

test("saved affiliate compensation opens directly on events and preserves every existing rate through final confirmation", async context => {
  const ui = await setup(context, { affiliate: existing, initialStep: 2, assignments: [eurRate(eventA.id, 700), creditsRate(eventB.id, 12)] });
  assert.equal(window.document.querySelector("h3").textContent, "Eventi associati");
  assert.ok(window.document.querySelector('nav [aria-current="step"]').textContent.includes("Eventi"));
  assert.equal(ui.field("Compenso per iscritto (€)").value, "7,00");
  assert.equal(ui.field("Compenso per iscritto (crediti)").value, "12");
  assert.equal(ui.calls.length, 0);
  await ui.click("Avanti");
  assert.ok(window.document.querySelector('[aria-label="Riepilogo eventi"]').textContent.includes("12 crediti"));
  assert.equal(ui.calls.length, 0);
  await ui.click("Salva modifiche");
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0][0], "update"); assert.equal(ui.calls[0][1], existing.id);
  assert.equal(ui.calls[0][2].defaultCommissionCents, 500);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0][2].assignments)), [eurRate(eventA.id, 700), creditsRate(eventB.id, 12)]);
});

test("an invalid saved profile cannot skip data validation through the compensation entry point", async context => {
  const ui = await setup(context, { affiliate: { ...existing, email: "invalid-email" }, initialStep: 2, assignments: [eurRate(eventA.id, 700)] });
  assert.equal(window.document.querySelector("h3").textContent, "Dati dell’affiliato");
  await ui.click("Avanti");
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("email"));
  assert.equal(ui.calls.length, 0);
});

test("reactivating a historical event preserves its override instead of replacing it with the current default", async context => {
  const ui = await setup(context, { affiliate: existing, assignments: [{ eventId: eventA.id, commissionCents: 700, active: false }] });
  await ui.click("Avanti");
  await ui.fill("Compenso per iscritto valido", "9,00");
  await ui.click("Avanti");
  assert.equal(window.document.querySelectorAll('input[inputmode="decimal"]').length, 0);
  assert.equal(window.document.querySelector(`input[aria-label="Associa a ${eventA.title}"]`).checked, false);
  await ui.toggle(eventA.title);
  assert.equal(ui.field("Compenso per iscritto (€)").value, "7,00", "the previous event rate is restored");
  await ui.toggle(eventB.title);
  assert.deepEqual([...window.document.querySelectorAll('input[inputmode="decimal"]')].map(input => input.value), ["7,00", "9,00"]);
  await ui.click("Avanti"); await ui.click("Salva modifiche");
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0][2].assignments)), [eurRate(eventA.id, 700), eurRate(eventB.id, 900)]);
});

test("a save failure keeps the full draft available for correction", async context => {
  const ui = await setup(context, {}, { create: async () => ({ success: false, error: "Esiste già un affiliato con questo nome." }) });
  await ui.fill("Nome e cognome", "Affiliato duplicato");
  await ui.click("Avanti"); await ui.click("Avanti"); await ui.click("Avanti");
  await ui.click("Crea affiliato");
  assert.equal(ui.saved.length, 0);
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("Esiste già"));
  await ui.click("Modifica dati");
  assert.equal(ui.field("Nome e cognome").value, "Affiliato duplicato");
  assert.equal(ui.calls.length, 1);
});

test("cancel has no server side effect and future-step navigation cannot bypass changed invalid rates", async context => {
  const ui = await setup(context, { affiliate: existing });
  await ui.click("Avanti"); await ui.click("Avanti"); await ui.click("Avanti");
  await ui.click("Modifica compenso");
  await ui.fill("Compenso per iscritto valido", "-2");
  await ui.click("Dati");
  await act(async () => [...window.document.querySelectorAll("nav button")].find(button => button.textContent.includes("Riepilogo")).click());
  assert.ok(window.document.querySelector('[role="alert"]').textContent.includes("compenso"));
  assert.ok(ui.field("Compenso per iscritto valido"));
  const close = window.document.querySelector('button[aria-label="Chiudi modifica affiliato"]');
  await act(async () => close.click());
  assert.equal(ui.cancel.length, 1);
  assert.equal(ui.calls.length, 0);
});

test("credit defaults and euro overrides remain separate without currency conversion", async context => {
  const ui = await setup(context);
  await ui.fill("Nome e cognome", "Scuola Crediti"); await ui.click("Avanti");
  await ui.fill("Compenso per iscritto valido", "7,50");
  await ui.unit("credits");
  assert.equal(ui.field("Compenso per iscritto valido (crediti)").value, "0");
  assert.equal(ui.field("Compenso per iscritto valido (crediti)").inputMode, "numeric");
  await ui.fill("Compenso per iscritto valido (crediti)", "3");
  await ui.unit("eur"); assert.equal(ui.field("Compenso per iscritto valido (€)").value, "7,50");
  await ui.unit("credits"); assert.equal(ui.field("Compenso per iscritto valido (crediti)").value, "3");
  await ui.click("Avanti"); await ui.toggle(eventA.title); await ui.toggle(eventB.title);
  assert.deepEqual([...window.document.querySelectorAll('input[inputmode="numeric"]')].map(input => input.value), ["3", "3"]);
  await ui.unit("eur", eventB.title);
  await ui.fill("Compenso per iscritto (€)", "8,25");
  await ui.click("Avanti");
  assert.match(window.document.querySelector('[aria-label="Riepilogo compenso"]').textContent, /3 crediti/);
  assert.match(window.document.querySelector('[aria-label="Riepilogo eventi"]').textContent, /8,25/);
  await ui.click("Crea affiliato");
  assert.equal(ui.calls[0][1].defaultCommissionType, "credits");
  assert.equal(ui.calls[0][1].defaultCommissionCents, 0);
  assert.equal(ui.calls[0][1].defaultCommissionCredits, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0][1].assignments)), [creditsRate(eventA.id, 3), eurRate(eventB.id, 825)]);
});

test("credit input rejects decimal, negative and excessive values while accepting zero", async context => {
  const ui = await setup(context, { events: [] });
  await ui.fill("Nome e cognome", "Crediti validi"); await ui.click("Avanti"); await ui.unit("credits");
  for (const invalid of ["1,5", "1.5", "-1", "1000001", "1e3"]) {
    await ui.fill("Compenso per iscritto valido", invalid); await ui.click("Avanti");
    assert.match(window.document.querySelector('[role="alert"]').textContent, /numero intero/);
    assert.equal(ui.calls.length, 0);
  }
  await ui.fill("Compenso per iscritto valido", "0"); await ui.click("Avanti"); await ui.click("Avanti"); await ui.click("Crea affiliato");
  assert.equal(ui.calls[0][1].defaultCommissionType, "credits"); assert.equal(ui.calls[0][1].defaultCommissionCredits, 0);
});

test("reactivated historical credit overrides retain both their unit and amount after default changes", async context => {
  const ui = await setup(context, { affiliate: existing, assignments: [{ ...creditsRate(eventA.id, 12), active: false }] });
  await ui.click("Avanti"); await ui.fill("Compenso per iscritto valido", "9,00"); await ui.click("Avanti");
  await ui.toggle(eventA.title);
  assert.equal(ui.field("Compenso per iscritto (crediti)").value, "12");
  await ui.fill("Compenso per iscritto (crediti)", "15");
  await ui.toggle(eventA.title); await ui.toggle(eventA.title);
  assert.equal(ui.field("Compenso per iscritto (crediti)").value, "15");
  await ui.toggle(eventB.title);
  assert.equal(ui.field("Compenso per iscritto (€)").value, "9,00");
  await ui.click("Avanti"); await ui.click("Salva modifiche");
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls[0][2].assignments)), [creditsRate(eventA.id, 15), eurRate(eventB.id, 900)]);
});
