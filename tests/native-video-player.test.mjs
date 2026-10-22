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

async function mount(context, { locale = "it", strict = false, play = [], deviceVolume = false } = {}) {
  const prototype = dom.window.HTMLMediaElement.prototype;
  const previous = new Map(["play", "pause", "load", "volume", "muted"].map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)]));
  const calls = [];
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
    const element = React.createElement(NativeVideoPlayer, { src, title, locale, ...props });
    await act(async () => { root.render(strict ? React.createElement(React.StrictMode, null, element) : element); });
  };
  const unmount = async () => { if (!unmounted) { await act(async () => root.unmount()); unmounted = true; } };
  context.after(async () => {
    await unmount(); host.remove();
    for (const [key, descriptor] of previous) Object.defineProperty(prototype, key, descriptor);
  });
  await render();
  return { host, root, calls, render, unmount, media: host.querySelector("video") };
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
