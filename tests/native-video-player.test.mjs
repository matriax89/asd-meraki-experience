import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "https://meraki.test/it/eventi/vibra", pretendToBeVisual: true });
const originals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
after(() => { dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
const compiled = { exports: {} };
const source = ts.transpileModule(readFileSync(new URL("../src/components/meraki/native-video-player.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
vm.runInNewContext(source, { module: compiled, exports: compiled.exports, window: dom.window, document: dom.window.document, URL, console, require });
const { NativeVideoPlayer } = compiled.exports;
const src = "https://meraki.test/media/vibra.mp4";
const title = "Un assaggio dell’esperienza Meraki";
const action = async callback => act(async () => callback());
const notAllowed = () => Promise.reject(Object.assign(new Error("Autoplay is blocked"), { name: "NotAllowedError" }));
const defer = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

async function mount(context, { locale = "it", strict = false, play = [], deviceVolume = false, withSection = false } = {}) {
  const prototype = dom.window.HTMLMediaElement.prototype;
  const previous = new Map(["play", "pause", "load", "volume", "muted"].map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)]));
  const calls = [];
  const gestureListeners = new Map();
  const addEventListener = document.addEventListener;
  const removeEventListener = document.removeEventListener;
  document.addEventListener = function (type, listener, capture) {
    if (capture === true && ["click", "keydown"].includes(type)) {
      if (!gestureListeners.has(type)) gestureListeners.set(type, new Set());
      gestureListeners.get(type).add(listener);
    }
    return addEventListener.call(this, type, listener, capture);
  };
  document.removeEventListener = function (type, listener, capture) {
    if (capture === true) gestureListeners.get(type)?.delete(listener);
    return removeEventListener.call(this, type, listener, capture);
  };
  const values = new WeakMap();
  let playIndex = 0;
  const value = media => { if (!values.has(media)) values.set(media, { volume: 1, muted: false }); return values.get(media); };
  Object.defineProperties(prototype, {
    volume: { configurable: true, get() { return deviceVolume ? 1 : value(this).volume; }, set(next) { calls.push({ type: "volume", value: next, media: this }); if (!deviceVolume) value(this).volume = next; } },
    muted: { configurable: true, get() { return value(this).muted; }, set(next) { calls.push({ type: "muted", value: next, media: this }); value(this).muted = next; } },
    play: { configurable: true, value() { calls.push({ type: "play", muted: this.muted, volume: this.volume, src: this.getAttribute("src"), media: this }); const next = play[playIndex++]; return next ? next(this) : Promise.resolve(); } },
    pause: { configurable: true, value() { calls.push({ type: "pause", media: this }); } },
    load: { configurable: true, value() { calls.push({ type: "load", src: this.getAttribute("src"), media: this }); } },
  });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let unmounted = false;
  const render = async (props = {}) => {
    const player = React.createElement(NativeVideoPlayer, { src, title, locale, ...props });
    const element = withSection ? React.createElement("section", { "data-event-video": true }, React.createElement("button", { "aria-label": "Close video" }, "Close"), player) : player;
    await act(async () => { root.render(strict ? React.createElement(React.StrictMode, null, element) : element); });
  };
  const unmount = async () => { if (!unmounted) { await act(async () => root.unmount()); unmounted = true; } };
  context.after(async () => {
    await unmount(); host.remove();
    document.addEventListener = addEventListener;
    document.removeEventListener = removeEventListener;
    for (const [key, descriptor] of previous) Object.defineProperty(prototype, key, descriptor);
  });
  await render();
  // jsdom cannot synthesize isTrusted=true. Invoke the registered browser
  // listener directly; production acceptance additionally uses a real click.
  const gesture = (type, values = {}) => {
    const event = { type, target: document.body, isTrusted: true, ...values };
    for (const listener of [...gestureListeners.get(type) || []]) listener(event);
  };
  return { host, root, calls, render, unmount, gesture, gestureListeners, media: host.querySelector("video") };
}

test("server markup starts muted with native controls and playback configures low volume before unmuting", async context => {
  const html = renderToStaticMarkup(React.createElement(NativeVideoPlayer, { src, title, locale: "it" }));
  assert.match(html, /<video[^>]*muted=""/);
  assert.match(html, /<video[^>]*controls=""/);
  assert.match(html, /<video[^>]*playsInline=""/i);
  assert.match(html, /preload="metadata"/);
  assert.doesNotMatch(html, /<iframe|<script|youtube|autoplay=/i);
  const { host, calls, media } = await mount(context);
  const configure = calls.findIndex(call => call.type === "volume" && call.value === 0.2);
  const unmute = calls.findIndex(call => call.type === "muted" && call.value === false);
  const play = calls.findIndex(call => call.type === "play");
  assert.ok(configure >= 0 && configure < unmute && unmute < play);
  assert.equal(calls[play].muted, false);
  assert.equal(calls[play].volume, 0.2);
  assert.equal(media.getAttribute("aria-label"), title);
  assert.ok(host.textContent.includes("Volume 20%"));
  assert.equal(host.querySelector('button[aria-pressed="true"]').textContent, "Disattiva audio");
});

test("blocked audible autoplay retries muted exactly once and exposes manual play if both attempts fail", async context => {
  const { host, calls } = await mount(context, { play: [notAllowed, notAllowed] });
  const attempts = calls.filter(call => call.type === "play");
  assert.deepEqual(attempts.map(call => [call.muted, call.volume]), [[false, 0.2], [true, 0.2]]);
  assert.ok(host.textContent.includes("Premi Riproduci"));
  const manual = [...host.querySelectorAll("button")].find(button => button.textContent === "Riproduci video");
  assert.ok(manual);
  await action(() => manual.click());
  assert.equal(calls.filter(call => call.type === "play").length, 3);
  assert.equal(host.textContent.includes("Premi Riproduci"), false);
  assert.ok(host.textContent.includes("Attiva audio · 20%"));
  await action(() => host.querySelector("button").click());
  const lastPlay = calls.findLast(call => call.type === "play");
  assert.equal(lastPlay.muted, false);
  assert.equal(lastPlay.volume, 0.2);
});

test("successful muted fallback does not show an unnecessary play button", async context => {
  const { host, calls } = await mount(context, { play: [notAllowed] });
  assert.deepEqual(calls.filter(call => call.type === "play").map(call => call.muted), [false, true]);
  assert.equal(host.querySelectorAll("button").length, 1);
  assert.ok(host.textContent.includes("Video senza audio"));
});

test("the first trusted page click starts sound at 20 percent synchronously and removes recovery listeners", async context => {
  const { calls, media, gesture, gestureListeners } = await mount(context, { play: [notAllowed] });
  assert.equal(media.muted, true);
  assert.equal(gestureListeners.get("click").size, 1);
  await action(() => {
    gesture("click");
    assert.equal(calls.filter(call => call.type === "play").length, 3, "play must occur in the same activation stack");
    assert.equal(calls.at(-1).volume, 0.2);
    assert.equal(calls.at(-1).muted, false);
  });
  assert.equal(media.muted, false);
  assert.equal(gestureListeners.get("click").size, 0);
  assert.equal(gestureListeners.get("keydown").size, 0);
  await action(() => gesture("click"));
  assert.equal(calls.filter(call => call.type === "play").length, 3, "recovery is one-shot");
});

test("untrusted clicks, scroll, pointer movement and modifier keys do not activate sound", async context => {
  const { calls, media, gesture } = await mount(context, { play: [notAllowed] });
  await action(() => {
    document.body.click();
    gesture("click", { isTrusted: false });
    gesture("pointerdown");
    gesture("pointermove");
    gesture("scroll");
    gesture("keydown", { key: "Shift" });
    gesture("keydown", { key: "Enter", ctrlKey: true });
    gesture("keydown", { key: "Enter", repeat: true });
  });
  assert.equal(media.muted, true);
  assert.equal(calls.filter(call => call.type === "play").length, 2);
  await action(() => gesture("keydown", { key: "Enter" }));
  assert.equal(media.muted, false);
  assert.equal(calls.findLast(call => call.type === "play").volume, 0.2);
});

for (const choice of ["volume", "mute", "pause", "native controls", "manual play"]) {
  test(`an explicit ${choice} choice cancels automatic sound activation`, async context => {
    const { host, calls, media, gesture, gestureListeners } = await mount(context, { play: [notAllowed, ...(choice === "manual play" ? [notAllowed] : [])] });
    await action(() => {
      if (choice === "volume") { media.volume = 0.43; media.dispatchEvent(new dom.window.Event("volumechange")); }
      if (choice === "mute") { media.muted = false; media.dispatchEvent(new dom.window.Event("volumechange")); media.muted = true; media.dispatchEvent(new dom.window.Event("volumechange")); }
      if (choice === "pause") media.dispatchEvent(new dom.window.Event("pause"));
      if (choice === "native controls") media.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
      if (choice === "manual play") [...host.querySelectorAll("button")].find(button => button.textContent === "Riproduci video").click();
    });
    assert.equal(gestureListeners.get("click").size, 0);
    assert.equal(gestureListeners.get("keydown").size, 0);
    const attempts = calls.filter(call => call.type === "play").length;
    await action(() => gesture("click"));
    assert.equal(calls.filter(call => call.type === "play").length, attempts);
    assert.equal(media.muted, true);
    if (choice === "volume") assert.equal(media.volume, 0.43);
  });
}

test("player audio controls win over the page gesture and programmatic mute events preserve pending recovery", async context => {
  const { host, calls, media, gesture, gestureListeners } = await mount(context, { play: [notAllowed] });
  await action(() => media.dispatchEvent(new dom.window.Event("volumechange")));
  assert.equal(gestureListeners.get("click").size, 1, "our own queued volumechange must not cancel recovery");
  await action(() => gesture("click", { target: media }));
  assert.equal(calls.filter(call => call.type === "play").length, 2);
  await action(() => host.querySelector("button").click());
  assert.equal(calls.filter(call => call.type === "play").length, 3, "the explicit audio button should play only once");
  assert.equal(media.muted, false);
  assert.equal(gestureListeners.get("click").size, 0);
});

test("the video section’s close button cannot trigger sound just before the parent removes it", async context => {
  const { host, calls, media, gesture } = await mount(context, { play: [notAllowed], withSection: true });
  await action(() => gesture("click", { target: host.querySelector('button[aria-label="Close video"]') }));
  assert.equal(calls.filter(call => call.type === "play").length, 2);
  assert.equal(media.muted, true);
});

test("late muted-play rejections cannot undo sound started by a trusted gesture", async context => {
  const pending = defer();
  const { calls, media, gesture } = await mount(context, { play: [notAllowed, () => pending.promise] });
  await action(() => gesture("click"));
  assert.equal(media.muted, false);
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Old muted attempt"), { name: "NotAllowedError" })));
  assert.equal(media.muted, false);
  assert.equal(calls.length, count);
});

test("a rejected gesture recovery stays one-shot and keeps the manual sound control", async context => {
  const { host, calls, media, gesture, gestureListeners } = await mount(context, { play: [notAllowed, () => Promise.resolve(), notAllowed] });
  await action(() => gesture("click"));
  assert.equal(media.muted, true);
  assert.equal(calls.filter(call => call.type === "play").length, 4);
  assert.equal(gestureListeners.get("click").size, 0);
  await action(() => gesture("keydown", { key: "Enter" }));
  assert.equal(calls.filter(call => call.type === "play").length, 4);
  assert.equal(host.querySelector("button").textContent, "Attiva audio · 20%");
});

for (const end of ["source change", "unmount", "media error"]) {
  test(`${end} removes pending sound-recovery listeners, including under StrictMode`, async context => {
    const { calls, media, gesture, gestureListeners, render, unmount } = await mount(context, { strict: true, play: [notAllowed, notAllowed] });
    assert.equal(gestureListeners.get("click").size, 1);
    if (end === "source change") await render({ src: "https://meraki.test/media/another.mp4" });
    if (end === "unmount") await unmount();
    if (end === "media error") await action(() => media.dispatchEvent(new dom.window.Event("error")));
    assert.equal(gestureListeners.get("click").size, 0);
    assert.equal(gestureListeners.get("keydown").size, 0);
    const count = calls.length;
    await action(() => gesture("click"));
    assert.equal(calls.length, count);
  });
}

test("native volume changes and locale/title rerenders preserve the visitor’s volume without restarting", async context => {
  const { host, calls, media, render } = await mount(context);
  await action(() => { media.volume = 0.63; media.dispatchEvent(new dom.window.Event("volumechange")); });
  assert.ok(host.textContent.includes("Volume 63%"));
  const plays = calls.filter(call => call.type === "play").length;
  await render({ title: "Meraki preview", locale: "en" });
  assert.equal(host.querySelector("video"), media);
  assert.equal(media.getAttribute("aria-label"), "Meraki preview");
  assert.equal(media.volume, 0.63);
  assert.equal(calls.filter(call => call.type === "play").length, plays);
  assert.ok(host.textContent.includes("Volume 63% · Adjust it"));
  await action(() => host.querySelector("button").click());
  assert.equal(media.muted, true);
  assert.equal(media.volume, 0.63);
  assert.equal(calls.filter(call => call.type === "play").length, plays, "muting must not resume a paused video");
});

test("devices that ignore software volume autoplay muted and never promise a 20-percent volume", async context => {
  const { host, calls, media } = await mount(context, { deviceVolume: true });
  assert.equal(calls.find(call => call.type === "play").muted, true);
  assert.equal(host.textContent.includes("20%"), false);
  assert.equal(host.querySelector("button").textContent, "Attiva audio");
  assert.ok(host.textContent.includes("tasti del telefono"));
  await action(() => host.querySelector("button").click());
  assert.equal(media.muted, false);
  assert.equal(media.volume, 1);
  assert.equal(host.textContent.includes("20%"), false);
});

test("media load errors explain the failure without starting a different player", async context => {
  const { host, calls, media } = await mount(context);
  await action(() => media.dispatchEvent(new dom.window.Event("error")));
  assert.equal(host.querySelector('[role="status"]').textContent, "Il video non è disponibile. Riprova tra poco.");
  assert.equal(host.querySelector("button"), null);
  assert.equal(host.querySelector("iframe, script"), null);
  assert.equal(calls.filter(call => call.type === "play").length, 1);
});

test("unsupported playback failures are not retried as autoplay failures", async context => {
  const { host, calls } = await mount(context, { play: [() => Promise.reject(Object.assign(new Error("Unsupported media"), { name: "NotSupportedError" }))] });
  assert.ok(host.textContent.includes("Il video non è disponibile"));
  assert.equal(calls.filter(call => call.type === "play").length, 1);
});

test("a changed source releases the old video and starts the new source at low volume", async context => {
  const { host, calls, media, render } = await mount(context);
  await action(() => { media.volume = 0.8; media.dispatchEvent(new dom.window.Event("volumechange")); });
  const next = "https://meraki.test/media/new-vibra.mp4";
  await render({ src: next });
  const replacement = host.querySelector("video");
  assert.notEqual(replacement, media);
  assert.equal(media.getAttribute("src"), null);
  assert.ok(calls.some(call => call.type === "pause" && call.media === media));
  assert.ok(calls.some(call => call.type === "load" && call.media === media && call.src === null));
  assert.equal(replacement.src, next);
  assert.equal(replacement.volume, 0.2);
  assert.equal(calls.findLast(call => call.type === "play").media, replacement);
});

test("unmount releases media and late rejected playback cannot restart or unmute it", async context => {
  const pending = defer();
  const { host, calls, media, unmount } = await mount(context, { play: [() => pending.promise] });
  await unmount();
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Late autoplay rejection"), { name: "NotAllowedError" })));
  assert.equal(calls.length, count);
  assert.equal(host.querySelector("video"), null);
  assert.equal(media.getAttribute("src"), null);
  assert.equal(calls.at(-2).type, "pause");
  assert.equal(calls.at(-1).type, "load");
});

test("StrictMode restores its owned source while stale playback promises remain inactive", async context => {
  const pending = defer();
  const { host, calls, media, unmount } = await mount(context, { strict: true, play: [() => pending.promise] });
  assert.equal(media.src, src);
  assert.equal(calls.filter(call => call.type === "play").length, 2);
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Old effect"), { name: "NotAllowedError" })));
  assert.equal(calls.length, count);
  assert.ok(host.textContent.includes("Volume 20%"));
  await unmount();
  assert.equal(media.getAttribute("src"), null);
});

for (const [locale, volume, enable] of [["en", "Volume 20%", "Turn sound on · 20%"], ["de", "Lautstärke 20%", "Ton einschalten · 20%"], ["es", "Volumen 20%", "Activar sonido · 20%"]]) {
  test(`${locale}: audio controls and status follow the selected language`, async context => {
    const { host } = await mount(context, { locale });
    assert.ok(host.textContent.includes(volume));
    await action(() => host.querySelector("button").click());
    assert.equal(host.querySelector("button").textContent, enable);
  });
}
