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
const aborted = () => Promise.reject(Object.assign(new Error("Startup was interrupted"), { name: "AbortError" }));
const defer = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

async function mount(context, { locale = "it", strict = false, play = [], deviceVolume = false, withSection = false, playEvents = true } = {}) {
  const prototype = dom.window.HTMLMediaElement.prototype;
  const previous = new Map(["play", "pause", "load", "volume", "muted", "paused", "readyState", "src"].map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)]));
  const calls = [];
  const previousSetTimeout = window.setTimeout;
  const previousClearTimeout = window.clearTimeout;
  const previousVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  const timers = new Map();
  let clock = 0;
  let timerId = 0;
  window.setTimeout = (callback, delay = 0, ...args) => { const id = ++timerId; timers.set(id, { at: clock + Number(delay), callback, args }); return id; };
  window.clearTimeout = id => timers.delete(id);
  let visibilityState = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilityState });
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
  const value = media => { if (!values.has(media)) values.set(media, { volume: 1, muted: false, paused: true, readyState: 0 }); return values.get(media); };
  Object.defineProperties(prototype, {
    volume: { configurable: true, get() { return deviceVolume ? 1 : value(this).volume; }, set(next) { calls.push({ type: "volume", value: next, media: this }); if (!deviceVolume) value(this).volume = next; } },
    muted: { configurable: true, get() { return value(this).muted; }, set(next) { calls.push({ type: "muted", value: next, media: this }); value(this).muted = next; } },
    paused: { configurable: true, get() { return value(this).paused; } },
    readyState: { configurable: true, get() { return value(this).readyState; } },
    src: { configurable: true, get() { return previous.get("src").get.call(this); }, set(next) { calls.push({ type: "src", value: next, media: this }); previous.get("src").set.call(this, next); value(this).paused = true; value(this).readyState = 0; } },
    play: { configurable: true, value() {
      calls.push({ type: "play", muted: this.muted, volume: this.volume, src: this.getAttribute("src"), media: this });
      const next = play[playIndex++];
      const result = next ? next(this) : Promise.resolve();
      return Promise.resolve(result).then(() => {
        if (playEvents) {
          value(this).paused = false; value(this).readyState = 4;
          this.dispatchEvent(new dom.window.Event("play")); this.dispatchEvent(new dom.window.Event("playing"));
        }
      });
    } },
    pause: { configurable: true, value() { calls.push({ type: "pause", media: this }); const wasPlaying = !this.paused; value(this).paused = true; if (wasPlaying) this.dispatchEvent(new dom.window.Event("pause")); } },
    load: { configurable: true, value() { calls.push({ type: "load", src: this.getAttribute("src"), media: this }); value(this).paused = true; value(this).readyState = 0; } },
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
    window.setTimeout = previousSetTimeout;
    window.clearTimeout = previousClearTimeout;
    if (previousVisibility) Object.defineProperty(document, "visibilityState", previousVisibility); else delete document.visibilityState;
    for (const [key, descriptor] of previous) Object.defineProperty(prototype, key, descriptor);
  });
  await render();
  // jsdom cannot synthesize isTrusted=true. Invoke the registered browser
  // listener directly; production acceptance additionally uses a real click.
  const gesture = (type, values = {}) => {
    const event = { type, target: document.body, isTrusted: true, ...values };
    for (const listener of [...gestureListeners.get(type) || []]) listener(event);
  };
  const ready = (type = "canplay") => { const media = host.querySelector("video"); value(media).readyState = 4; media.dispatchEvent(new dom.window.Event(type)); };
  const visibility = next => { visibilityState = next; document.dispatchEvent(new dom.window.Event("visibilitychange")); };
  const advance = milliseconds => {
    const limit = clock + milliseconds;
    let iterations = 0;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= limit).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      assert.ok(++iterations < 100, "player timers must not create a busy retry loop");
      const [id, timer] = due; timers.delete(id); clock = timer.at; timer.callback(...timer.args);
    }
    clock = limit;
  };
  return { host, root, calls, render, unmount, gesture, gestureListeners, ready, visibility, advance, timers, media: host.querySelector("video") };
}

const attempts = calls => calls.filter(call => call.type === "play");
const listenerCount = (listeners, type) => listeners.get(type)?.size || 0;
const playButton = host => [...host.querySelectorAll("button")].find(button => button.textContent === "Riproduci video");

test("the server requests inline muted autoplay and the first script attempt stays muted at low volume", async context => {
  const html = renderToStaticMarkup(React.createElement(NativeVideoPlayer, { src, title, locale: "it" }));
  assert.match(html, /<video[^>]*muted=""/);
  assert.match(html, /<video[^>]*autoPlay=""/i);
  assert.match(html, /<video[^>]*controls=""/);
  assert.match(html, /<video[^>]*playsInline=""/i);
  assert.match(html, /preload="auto"/);
  assert.doesNotMatch(html, /<iframe|<script|youtube/i);
  const { host, calls, media } = await mount(context);
  const configure = calls.findIndex(call => call.type === "volume" && call.value === 0.2);
  const firstPlay = calls.findIndex(call => call.type === "play");
  assert.ok(configure >= 0 && configure < firstPlay);
  assert.equal(calls[firstPlay].muted, true, "do not risk audible autoplay before images have started");
  assert.equal(calls[firstPlay].volume, 0.2);
  assert.equal(media.paused, false);
  assert.equal(media.getAttribute("aria-label"), title);
  assert.equal(calls.some(call => call.type === "src"), false, "hydration must not reset an already matching media source");
  assert.equal(host.querySelector("button").textContent, "Attiva audio · 20%");
  assert.equal(playButton(host), undefined);
});

test("a browser denial exposes a usable manual play button and never retries audibly on its own", async context => {
  const { host, calls, media } = await mount(context, { play: [notAllowed] });
  assert.ok(attempts(calls).length >= 1 && attempts(calls).length <= 2);
  assert.ok(attempts(calls).every(call => call.muted));
  assert.ok(host.textContent.includes("Premi Riproduci"));
  assert.ok(playButton(host));
  await action(() => playButton(host).click());
  assert.equal(media.paused, false);
  assert.equal(host.textContent.includes("Premi Riproduci"), false);
  assert.equal(media.muted, true);
  await action(() => host.querySelector("button").click());
  assert.equal(attempts(calls).at(-1).muted, false);
  assert.equal(attempts(calls).at(-1).volume, 0.2);
});

test("a first trusted page click enables low sound synchronously even when muted autoplay succeeded", async context => {
  const { calls, media, gesture, gestureListeners } = await mount(context);
  assert.equal(media.muted, true);
  assert.equal(listenerCount(gestureListeners, "click"), 1);
  const before = attempts(calls).length;
  await action(() => {
    gesture("click");
    assert.equal(attempts(calls).length, before + 1, "play must run within the same activation stack");
    assert.equal(attempts(calls).at(-1).muted, false);
    assert.equal(attempts(calls).at(-1).volume, 0.2);
  });
  assert.equal(media.muted, false);
  assert.equal(listenerCount(gestureListeners, "click"), 0);
  assert.equal(listenerCount(gestureListeners, "keydown"), 0);
  await action(() => gesture("click"));
  assert.equal(attempts(calls).length, before + 1, "audio recovery must be one-shot");
});

test("untrusted events, scrolling, pointer movement and modifier keys do not enable sound", async context => {
  const { calls, media, gesture } = await mount(context);
  const before = attempts(calls).length;
  await action(() => {
    document.body.click();
    gesture("click", { isTrusted: false });
    gesture("pointerdown"); gesture("pointermove"); gesture("scroll");
    gesture("keydown", { key: "Shift" });
    gesture("keydown", { key: "Enter", ctrlKey: true });
    gesture("keydown", { key: "Enter", repeat: true });
  });
  assert.equal(media.muted, true);
  assert.equal(attempts(calls).length, before);
  await action(() => gesture("keydown", { key: "Enter" }));
  assert.equal(media.muted, false);
  assert.equal(attempts(calls).at(-1).volume, 0.2);
});

for (const choice of ["volume", "mute", "pause", "native controls", "manual play"]) {
  test(`the visitor's ${choice} choice prevents later automatic sound activation`, async context => {
    const { host, calls, media, gesture, gestureListeners } = await mount(context, { play: choice === "manual play" ? [notAllowed] : [] });
    await action(() => {
      if (choice === "volume") { media.volume = 0.43; media.dispatchEvent(new dom.window.Event("volumechange")); }
      if (choice === "mute") { media.muted = false; media.dispatchEvent(new dom.window.Event("volumechange")); media.muted = true; media.dispatchEvent(new dom.window.Event("volumechange")); }
      if (choice === "pause") media.pause();
      if (choice === "native controls") media.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
      if (choice === "manual play") playButton(host).click();
    });
    assert.equal(listenerCount(gestureListeners, "click"), 0);
    assert.equal(listenerCount(gestureListeners, "keydown"), 0);
    const before = attempts(calls).length;
    await action(() => gesture("click"));
    assert.equal(attempts(calls).length, before);
    assert.equal(media.muted, true);
    if (choice === "volume") assert.equal(media.volume, 0.43);
    if (choice === "pause") assert.equal(media.paused, true);
  });
}

test("queued programmatic volume events preserve recovery and explicit audio controls take priority", async context => {
  const { host, calls, media, gesture, gestureListeners } = await mount(context);
  await action(() => media.dispatchEvent(new dom.window.Event("volumechange")));
  assert.equal(listenerCount(gestureListeners, "click"), 1);
  const before = attempts(calls).length;
  await action(() => gesture("click", { target: media }));
  assert.equal(attempts(calls).length, before);
  await action(() => host.querySelector("button").click());
  assert.equal(attempts(calls).length, before + 1);
  assert.equal(media.muted, false);
  assert.equal(listenerCount(gestureListeners, "click"), 0);
});

test("closing the video section never briefly enables its audio", async context => {
  const { host, calls, media, gesture } = await mount(context, { withSection: true });
  const before = attempts(calls).length;
  await action(() => gesture("click", { target: host.querySelector('button[aria-label="Close video"]') }));
  assert.equal(attempts(calls).length, before);
  assert.equal(media.muted, true);
});

test("a startup pause and AbortError do not suppress the muted retry once media is ready", async context => {
  const pending = defer();
  const { host, calls, media, ready, gesture, gestureListeners, advance } = await mount(context, { play: [() => pending.promise] });
  await action(() => media.dispatchEvent(new dom.window.Event("pause")));
  await action(() => pending.reject(Object.assign(new Error("Source interrupted startup"), { name: "AbortError" })));
  await action(() => { ready(); advance(500); });
  assert.equal(media.paused, false);
  assert.ok(attempts(calls).length >= 2);
  assert.ok(attempts(calls).every(call => call.muted));
  assert.equal(playButton(host), undefined);
  assert.equal(listenerCount(gestureListeners, "click"), 1);
  await action(() => gesture("click"));
  assert.equal(media.muted, false);
});

test("readiness and return-to-visible can recover interrupted startup without unlimited retries", async context => {
  const { calls, media, ready, visibility, advance } = await mount(context, { play: Array(12).fill(aborted) });
  for (let index = 0; index < 8; index += 1) {
    await action(() => ready(index % 2 ? "canplay" : "loadedmetadata"));
    await action(() => { visibility("hidden"); visibility("visible"); advance(500); });
  }
  assert.ok(attempts(calls).length >= 2, "a ready, visible video must get a startup recovery attempt");
  assert.ok(attempts(calls).length <= 5, "repeated browser readiness events must not create endless play attempts");
  assert.ok(attempts(calls).every(call => call.muted));
  assert.equal(media.muted, true);
});

test("a startup that never settles exposes manual Play instead of leaving a permanent loading state", async context => {
  const pending = defer();
  const { host, calls, advance, media } = await mount(context, { play: [() => pending.promise] });
  await action(() => advance(10_000));
  assert.ok(playButton(host), "show a real recovery control when playback has not started within ten seconds");
  assert.ok(host.textContent.includes("Premi Riproduci"));
  assert.equal(media.paused, true);
  assert.ok(attempts(calls).every(call => call.muted));
  await action(() => playButton(host).click());
  assert.equal(media.paused, false);
  assert.equal(playButton(host), undefined);
});

test("a resolved play promise without actual playback cannot hide the manual Play fallback", async context => {
  const { host, calls, advance, media } = await mount(context, { playEvents: false });
  assert.equal(media.paused, true);
  await action(() => advance(10_000));
  assert.ok(playButton(host));
  assert.ok(host.textContent.includes("Premi Riproduci"));
  assert.ok(attempts(calls).length <= 3, "a fulfilled promise without playing must not create unlimited retries");
});

test("media readiness and visibility never restart a video after the visitor pauses it", async context => {
  const { calls, media, ready, visibility, advance } = await mount(context);
  await action(() => media.pause());
  const before = attempts(calls).length;
  await action(() => { ready(); visibility("hidden"); visibility("visible"); advance(20_000); });
  assert.equal(attempts(calls).length, before);
  assert.equal(media.paused, true);
});

test("late startup rejection cannot undo sound already started by the first gesture", async context => {
  const pending = defer();
  const { calls, media, gesture } = await mount(context, { play: [() => pending.promise] });
  await action(() => gesture("click"));
  assert.equal(media.muted, false);
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Old attempt"), { name: "NotAllowedError" })));
  assert.equal(media.muted, false);
  assert.equal(calls.length, count);
});

test("a denied audible gesture keeps the video playing muted and does not re-arm automatic sound", async context => {
  const { host, calls, media, gesture, gestureListeners } = await mount(context, { play: [() => Promise.resolve(), notAllowed] });
  await action(() => gesture("click"));
  assert.equal(media.muted, true);
  assert.equal(media.paused, false);
  assert.ok(attempts(calls).some(call => !call.muted));
  assert.equal(attempts(calls).at(-1).muted, true);
  assert.equal(listenerCount(gestureListeners, "click"), 0);
  const before = attempts(calls).length;
  await action(() => gesture("keydown", { key: "Enter" }));
  assert.equal(attempts(calls).length, before);
  assert.equal(host.querySelector("button").textContent, "Attiva audio · 20%");
});

for (const end of ["source change", "unmount", "media error"]) {
  test(`${end} removes old gesture recovery and startup timers under StrictMode`, async context => {
    const { calls, media, gesture, gestureListeners, render, unmount, timers, advance } = await mount(context, { strict: true });
    const oldListeners = [...gestureListeners.get("click") || []];
    assert.equal(oldListeners.length, 1);
    if (end === "source change") await render({ src: "https://meraki.test/media/another.mp4" });
    if (end === "unmount") await unmount();
    if (end === "media error") await action(() => media.dispatchEvent(new dom.window.Event("error")));
    for (const listener of oldListeners) assert.equal(gestureListeners.get("click").has(listener), false);
    if (end === "source change") {
      assert.equal(listenerCount(gestureListeners, "click"), 1, "the new source owns its own fresh gesture handler");
      await unmount();
    }
    assert.equal(listenerCount(gestureListeners, "click"), 0);
    assert.equal(listenerCount(gestureListeners, "keydown"), 0);
    assert.equal(timers.size, 0);
    const count = calls.length;
    await action(() => { gesture("click"); advance(20_000); });
    assert.equal(calls.length, count);
  });
}

test("locale/title rerenders preserve native volume and never restart the existing source", async context => {
  const { host, calls, media, render } = await mount(context);
  await action(() => { media.muted = false; media.volume = 0.63; media.dispatchEvent(new dom.window.Event("volumechange")); });
  assert.ok(host.textContent.includes("Volume 63%"));
  const before = attempts(calls).length;
  const sourceWrites = calls.filter(call => call.type === "src").length;
  await render({ title: "Meraki preview", locale: "en" });
  assert.equal(host.querySelector("video"), media);
  assert.equal(media.getAttribute("aria-label"), "Meraki preview");
  assert.equal(media.volume, 0.63);
  assert.equal(attempts(calls).length, before);
  assert.equal(calls.filter(call => call.type === "src").length, sourceWrites);
  assert.ok(host.textContent.includes("Volume 63% · Adjust it"));
  await action(() => host.querySelector("button").click());
  assert.equal(media.muted, true);
  assert.equal(media.volume, 0.63);
  assert.equal(attempts(calls).length, before, "muting must not resume a paused video");
});

test("devices without software volume start muted and leave sound activation to the visitor", async context => {
  const { host, calls, media, gesture, gestureListeners } = await mount(context, { deviceVolume: true });
  assert.equal(attempts(calls)[0].muted, true);
  assert.equal(host.textContent.includes("20%"), false);
  assert.equal(host.querySelector("button").textContent, "Attiva audio");
  assert.ok(host.textContent.includes("tasti del telefono"));
  assert.equal(listenerCount(gestureListeners, "click"), 0);
  const before = attempts(calls).length;
  await action(() => gesture("click"));
  assert.equal(attempts(calls).length, before);
  await action(() => host.querySelector("button").click());
  assert.equal(media.muted, false);
  assert.equal(media.volume, 1);
  assert.equal(host.textContent.includes("20%"), false);
});

test("media errors show a failure and never start another player", async context => {
  const { host, calls, media } = await mount(context);
  await action(() => media.dispatchEvent(new dom.window.Event("error")));
  assert.equal(host.querySelector('[role="status"]').textContent, "Il video non è disponibile. Riprova tra poco.");
  assert.equal(host.querySelector("button"), null);
  assert.equal(host.querySelector("iframe, script"), null);
  assert.equal(attempts(calls).length, 1);
});

test("unsupported media is not mistaken for a recoverable autoplay interruption", async context => {
  const { host, calls, advance, ready, visibility } = await mount(context, { play: [() => Promise.reject(Object.assign(new Error("Unsupported media"), { name: "NotSupportedError" }))] });
  assert.ok(host.textContent.includes("Il video non è disponibile"));
  await action(() => { ready(); visibility("hidden"); visibility("visible"); advance(20_000); });
  assert.equal(attempts(calls).length, 1);
});

test("changing the source releases the old video and starts the replacement muted at low volume", async context => {
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
  assert.equal(attempts(calls).at(-1).media, replacement);
  assert.equal(attempts(calls).at(-1).muted, true);
});

test("unmount releases the video and late playback rejection cannot restart it", async context => {
  const pending = defer();
  const { host, calls, media, unmount } = await mount(context, { play: [() => pending.promise] });
  await unmount();
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Late autoplay rejection"), { name: "NotAllowedError" })));
  assert.equal(calls.length, count);
  assert.equal(host.querySelector("video"), null);
  assert.equal(media.getAttribute("src"), null);
});

test("StrictMode restores the source after cleanup and ignores the abandoned effect's play promise", async context => {
  const pending = defer();
  const { calls, media, unmount } = await mount(context, { strict: true, play: [() => pending.promise] });
  assert.equal(media.src, src);
  assert.equal(media.muted, true);
  assert.equal(media.paused, false);
  assert.equal(attempts(calls).length, 2);
  const count = calls.length;
  await action(() => pending.reject(Object.assign(new Error("Old effect"), { name: "NotAllowedError" })));
  assert.equal(calls.length, count);
  await unmount();
  assert.equal(media.getAttribute("src"), null);
});

for (const [locale, volume, enable] of [["en", "Volume 20%", "Turn sound on · 20%"], ["de", "Lautstärke 20%", "Ton einschalten · 20%"], ["es", "Volumen 20%", "Activar sonido · 20%"]]) {
  test(`${locale}: manual audio controls and playback status follow the chosen language`, async context => {
    const { host } = await mount(context, { locale });
    assert.equal(host.querySelector("button").textContent, enable);
    await action(() => host.querySelector("button").click());
    assert.ok(host.textContent.includes(volume));
    await action(() => host.querySelector("button").click());
    assert.equal(host.querySelector("button").textContent, enable);
  });
}
