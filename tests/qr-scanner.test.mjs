import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://meraki.test",
  pretendToBeVisual: true,
});
const { window } = dom;
const globalDescriptors = new Map();
for (const [key, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
window.HTMLMediaElement.prototype.pause = function () {};
const { createRoot } = await import("react-dom/client");

after(() => {
  dom.window.close();
  for (const [key, descriptor] of globalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const eventId = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const qrCode = "ticket_opaque_code";
const source = readFileSync(new URL("../src/app/[locale]/admin/biglietti/qr-scanner.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function setup(context, { holdMedia = false, holdDecoder = false, immediateDecode = false, activities = [], access = { allowed: true }, holdAuthorization = false } = {}) {
  Object.defineProperty(window.document, "hidden", { configurable: true, value: false });
  window.document.body.innerHTML = '<div id="scanner-root"></div>';
  const mediaRequests = [];
  const decoders = [];
  const actionCalls = [];
  const checkedResults = [];
  const authorizationCalls = [];
  let currentAccess = access;
  const timeline = [];
  const getUserMedia = () => {
    const pending = deferred();
    const track = {
      readyState: "live",
      stopCount: 0,
      stop() { this.readyState = "ended"; this.stopCount += 1; timeline.push("track-stopped"); },
    };
    const stream = { getTracks: () => [track] };
    const request = { ...pending, stream, track };
    mediaRequests.push(request);
    timeline.push("media-requested");
    if (!holdMedia) pending.resolve(stream);
    return pending.promise;
  };
  Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  class BrowserQRCodeReader {
    async decodeFromStream(stream, video, callback) {
      video.srcObject = stream;
      const pending = deferred();
      const controls = { stop() { timeline.push("decoder-stopped"); } };
      const decoder = { callback, controls, ...pending };
      decoders.push(decoder);
      if (immediateDecode) callback({ getText: () => qrCode }, undefined, controls);
      if (!holdDecoder) pending.resolve(controls);
      return pending.promise;
    }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    window,
    document: window.document,
    navigator: window.navigator,
    Error,
    require: (name) => {
      if (name === "@zxing/browser") return { BrowserQRCodeReader };
      if (name === "@/app/api/admin/biglietti/actions") return {
        async checkInCameraAccess() {
          const pending = deferred();
          authorizationCalls.push(pending);
          timeline.push("camera-authorization-requested");
          return holdAuthorization ? pending.promise : currentAccess;
        },
        checkInQrCode(code, selectedEvent, activityId) {
          timeline.push("server-requested");
          const pending = deferred();
          actionCalls.push({ ...pending, code, eventId: selectedEvent, activityId, trackState: mediaRequests.at(-1)?.track.readyState });
          return pending.promise;
        },
      };
      return require(name);
    },
  });
  const root = createRoot(window.document.getElementById("scanner-root"));
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await act(async () => root.unmount());
  };
  context.after(dispose);
  await act(async () => root.render(React.createElement(exports.QrScanner, {
    events: [{ id: eventId, titolo: "Evento Meraki", data_inizio: "2026-10-18T18:00:00Z", activities }],
    onChecked: (result) => checkedResults.push(result),
  })));
  const button = (text) => [...window.document.querySelectorAll("button")].find((element) => element.textContent.includes(text));
  const click = async (text) => {
    const element = button(text);
    assert.ok(element, `Button not found: ${text}`);
    assert.equal(element.disabled, false, `Button disabled: ${text}`);
    await act(async () => element.click());
  };
  const selectEvent = async () => {
    await act(async () => {
      const select = window.document.getElementById("check-in-event");
      select.value = eventId;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const decode = (code = qrCode, index = decoders.length - 1) => {
    const decoder = decoders[index];
    assert.ok(decoder, "Camera decoder should be running");
    act(() => decoder.callback({ getText: () => code }, undefined, decoder.controls));
  };
  const respond = async (result) => {
    await act(async () => actionCalls.at(-1).resolve(result));
  };
  return { mediaRequests, decoders, actionCalls, checkedResults, authorizationCalls, setAccess: (next) => { currentAccess = next; }, timeline, button, click, selectEvent, decode, respond, dispose };
}

test("the first decoded QR stops media tracks before contacting the server and locks repeated frames", async (context) => {
  const scanner = await setup(context);
  assert.equal(scanner.button("Attiva fotocamera").disabled, true);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  assert.equal(scanner.mediaRequests.length, 1);
  assert.equal(scanner.mediaRequests[0].track.readyState, "live");
  assert.equal(scanner.authorizationCalls.length, 1);
  assert.ok(scanner.timeline.indexOf("camera-authorization-requested") < scanner.timeline.indexOf("media-requested"));
  scanner.decode();
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  assert.equal(scanner.actionCalls.length, 1);
  assert.equal(scanner.actionCalls[0].trackState, "ended");
  assert.ok(scanner.timeline.indexOf("track-stopped") < scanner.timeline.indexOf("server-requested"));
  assert.equal(scanner.actionCalls[0].code, qrCode);
  assert.equal(scanner.actionCalls[0].eventId, eventId);
  assert.match(window.document.body.textContent, /Verifica in corso/);
  assert.equal(scanner.button("Prossimo biglietto"), undefined);
  scanner.decode();
  scanner.decode("another-code");
  assert.equal(scanner.actionCalls.length, 1);
  assert.equal(scanner.mediaRequests.length, 1);
  await scanner.respond({ outcome: "admitted", message: "Ingresso confermato." });
  assert.match(window.document.body.textContent, /Ingresso consentito/);
  assert.equal(scanner.mediaRequests.length, 1);
  assert.equal(window.document.getElementById("check-in-event").disabled, true);
  await scanner.click("Prossimo biglietto");
  assert.equal(scanner.mediaRequests.length, 2);
  assert.equal(scanner.authorizationCalls.length, 2);
  assert.equal(scanner.mediaRequests[1].track.readyState, "live");
  assert.equal(scanner.actionCalls.length, 1);
});

for (const identity of ["anonymous", "regular viewer"]) {
  test(`${identity} cannot open the camera and the scanner is removed after server denial`, async (context) => {
    const scanner = await setup(context, { access: { allowed: false, message: "Il check-in è riservato allo staff autenticato." } });
    await scanner.selectEvent();
    await scanner.click("Attiva fotocamera");
    assert.equal(scanner.authorizationCalls.length, 1);
    assert.equal(scanner.mediaRequests.length, 0);
    assert.equal(scanner.decoders.length, 0);
    assert.equal(scanner.actionCalls.length, 0);
    assert.equal(window.document.querySelector("video"), null);
    assert.equal(scanner.button("Attiva fotocamera"), undefined);
    assert.match(window.document.querySelector('[role="alert"]').textContent, /staff autenticato/);
  });
}

test("camera startup waits for server authorization before requesting any media", async (context) => {
  const scanner = await setup(context, { holdAuthorization: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  assert.equal(scanner.authorizationCalls.length, 1);
  assert.equal(scanner.mediaRequests.length, 0);
  await act(async () => scanner.authorizationCalls[0].resolve({ allowed: true }));
  assert.equal(scanner.mediaRequests.length, 1);
  assert.equal(scanner.mediaRequests[0].track.readyState, "live");
});

test("a late authorization response cannot open the camera after the operator stops startup", async (context) => {
  const scanner = await setup(context, { holdAuthorization: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  await scanner.click("Spegni fotocamera");
  await act(async () => scanner.authorizationCalls[0].resolve({ allowed: true }));
  assert.equal(scanner.mediaRequests.length, 0);
  assert.equal(scanner.decoders.length, 0);
});

test("the next-ticket button rechecks access and cannot reopen the camera after logout or revocation", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  scanner.decode();
  await scanner.respond({ outcome: "admitted", message: "Ingresso confermato." });
  scanner.setAccess({ allowed: false, message: "Sessione scaduta. Accedi di nuovo." });
  await scanner.click("Prossimo biglietto");
  assert.equal(scanner.authorizationCalls.length, 2);
  assert.equal(scanner.mediaRequests.length, 1);
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  assert.equal(window.document.querySelector("video"), null);
  assert.match(window.document.querySelector('[role="alert"]').textContent, /Sessione scaduta/);
});

for (const outcome of ["invalid", "already_used", "wrong_event", "unpaid", "refunded"]) {
  test(`${outcome} result keeps the camera off until the next-ticket button`, async (context) => {
    const scanner = await setup(context);
    await scanner.selectEvent();
    await scanner.click("Attiva fotocamera");
    scanner.decode("not-a-valid-ticket");
    await scanner.respond({ outcome, message: "Ingresso non autorizzato." });
    assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
    assert.equal(scanner.mediaRequests.length, 1);
    assert.equal(scanner.button("Attiva fotocamera"), undefined);
    assert.ok(scanner.button("Prossimo biglietto"));
    scanner.decode();
    assert.equal(scanner.actionCalls.length, 1);
    assert.equal(scanner.checkedResults[0].outcome, outcome);
    await scanner.click("Prossimo biglietto");
    assert.equal(scanner.mediaRequests.length, 2);
  });
}

test("a failed server request displays rejection and cannot restart scanning automatically", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  scanner.decode();
  await act(async () => scanner.actionCalls[0].reject(new Error("Offline")));
  assert.match(window.document.body.textContent, /Ingresso non consentito/);
  assert.match(window.document.body.textContent, /Connessione interrotta/);
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  assert.equal(scanner.mediaRequests.length, 1);
  scanner.decode();
  assert.equal(scanner.actionCalls.length, 1);
  await scanner.click("Prossimo biglietto");
  assert.equal(scanner.mediaRequests.length, 2);
});

test("a stale decoder cannot submit another code after the next camera session begins", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  scanner.decode();
  await scanner.respond({ outcome: "admitted", message: "Ingresso confermato." });
  await scanner.click("Prossimo biglietto");
  scanner.decode("stale-frame", 0);
  assert.equal(scanner.actionCalls.length, 1);
  assert.equal(scanner.mediaRequests[1].track.readyState, "live");
  scanner.decode("next-ticket", 1);
  assert.equal(scanner.actionCalls.length, 2);
  assert.equal(scanner.actionCalls[1].code, "next-ticket");
  assert.equal(scanner.mediaRequests[1].track.readyState, "ended");
  await scanner.respond({ outcome: "invalid", message: "Codice non valido." });
});

test("a QR decoded before decoder startup resolves still stops tracks immediately", async (context) => {
  const scanner = await setup(context, { immediateDecode: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  assert.equal(scanner.actionCalls.length, 1);
  assert.equal(scanner.actionCalls[0].trackState, "ended");
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  await scanner.respond({ outcome: "invalid", message: "Codice non valido." });
  assert.equal(scanner.mediaRequests.length, 1);
});

test("unmounting releases camera tracks and ignores late decoder callbacks", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  await scanner.dispose();
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  scanner.decode();
  assert.equal(scanner.actionCalls.length, 0);
});

test("hiding the page stops the camera and showing it does not reacquire media", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  await act(async () => {
    Object.defineProperty(window.document, "hidden", { configurable: true, value: true });
    window.document.dispatchEvent(new window.Event("visibilitychange"));
  });
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  scanner.decode();
  assert.equal(scanner.actionCalls.length, 0);
  await act(async () => {
    Object.defineProperty(window.document, "hidden", { configurable: true, value: false });
    window.document.dispatchEvent(new window.Event("visibilitychange"));
  });
  assert.equal(scanner.mediaRequests.length, 1);
  assert.ok(scanner.button("Attiva fotocamera"));
});

test("leaving the page stops camera tracks and ignores subsequent frames", async (context) => {
  const scanner = await setup(context);
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  await act(async () => window.dispatchEvent(new window.Event("pagehide")));
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  scanner.decode();
  assert.equal(scanner.actionCalls.length, 0);
});

test("stopping during a pending permission request closes the stream when permission later resolves", async (context) => {
  const scanner = await setup(context, { holdMedia: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  assert.equal(scanner.mediaRequests.length, 1);
  await scanner.click("Spegni fotocamera");
  await act(async () => scanner.mediaRequests[0].resolve(scanner.mediaRequests[0].stream));
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  assert.equal(scanner.decoders.length, 0);
  assert.equal(scanner.actionCalls.length, 0);
  assert.equal(scanner.mediaRequests.length, 1);
});

test("unmounting during a pending permission request closes its late stream", async (context) => {
  const scanner = await setup(context, { holdMedia: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  await scanner.dispose();
  await act(async () => scanner.mediaRequests[0].resolve(scanner.mediaRequests[0].stream));
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  assert.equal(scanner.decoders.length, 0);
});

test("camera cleanup also works while the decoder is still initializing", async (context) => {
  const scanner = await setup(context, { holdDecoder: true });
  await scanner.selectEvent();
  await scanner.click("Attiva fotocamera");
  assert.equal(scanner.decoders.length, 1);
  await scanner.click("Spegni fotocamera");
  assert.equal(scanner.mediaRequests[0].track.readyState, "ended");
  await act(async () => scanner.decoders[0].resolve(scanner.decoders[0].controls));
  scanner.decode();
  assert.equal(scanner.actionCalls.length, 0);
});


test("configured events require an explicit activity or legacy-entry choice before opening the camera", async (context) => {
  const scanner = await setup(context, { activities: [{ id: "dinner", name: "Cena" }] });
  await scanner.selectEvent();
  assert.equal(scanner.button("Attiva fotocamera").disabled, true);
  assert.equal(scanner.mediaRequests.length, 0);
  const select = window.document.getElementById("check-in-activity");
  assert.ok([...select.options].some((option) => option.value === "__legacy_event"));
  await act(async () => { select.value = "__legacy_event"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await scanner.click("Attiva fotocamera");
  scanner.decode();
  assert.equal(scanner.actionCalls[0].activityId, "__legacy_event");
  assert.equal(scanner.actionCalls[0].trackState, "ended");
  assert.equal(select.disabled, true);
  await scanner.respond({ outcome: "admitted", message: "Ingresso evento confermato" });
  assert.equal(select.disabled, true);
  assert.ok(scanner.button("Prossimo biglietto"));
});
