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
function load(file, mocks = {}, browser = dom.window) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, window: browser, document: browser.document, URL, console, require: name => name in mocks ? mocks[name] : require(name) });
  return compiled.exports;
}
const apiLoader = load("lib/events/youtube-player-api.ts");
const { YoutubePlayer } = load("components/meraki/youtube-player.tsx", { "@/lib/events/youtube-player-api": apiLoader });
const embed = "https://www.youtube-nocookie.com/embed/Ut08j478Ypg?autoplay=1&mute=1&playsinline=1&controls=1&rel=0";
let players = [];
class FakePlayer {
  volume = 100;
  muted = true;
  state = -1;
  calls = [];
  constructor(frame, options) { this.frame = frame; this.options = options; players.push(this); }
  setVolume(value) { this.calls.push(["setVolume", value]); this.volume = value; }
  getVolume() { return this.volume; }
  mute() { this.calls.push(["mute"]); this.muted = true; }
  unMute() { this.calls.push(["unMute"]); this.muted = false; }
  isMuted() { return this.muted; }
  playVideo() { this.calls.push(["playVideo"]); }
  getPlayerState() { return this.state; }
  destroy() { this.calls.push(["destroy"]); this.frame.remove(); }
  emit(name, data) { this.options.events[name]({ target: this, data }); }
}
async function mount(context, { locale = "it", strict = false } = {}) {
  players = [];
  dom.window.YT = { Player: FakePlayer };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const element = React.createElement(YoutubePlayer, { embed, title: "Un assaggio Meraki", locale });
  await act(async () => { root.render(strict ? React.createElement(React.StrictMode, null, element) : element); await new Promise(resolve => dom.window.setTimeout(resolve, 5)); });
  await act(async () => { await new Promise(resolve => dom.window.setTimeout(resolve, 5)); });
  context.after(async () => { await act(async () => root.unmount()); host.remove(); delete dom.window.YT; });
  return { host, root, player: players.at(-1) };
}
const action = async callback => act(async () => callback());

test("SSR is inert and first iframe is muted without autoplay until volume is set through the API", async context => {
  const html = renderToStaticMarkup(React.createElement(YoutubePlayer, { embed, title: "Meraki", locale: "it" }));
  assert.doesNotMatch(html, /<iframe|<script|src=/);
  const { host, player } = await mount(context);
  const frame = host.querySelector("iframe");
  const source = new URL(frame.src);
  assert.equal(source.origin, "https://www.youtube-nocookie.com");
  assert.equal(source.searchParams.get("origin"), "https://meraki.test");
  assert.equal(source.searchParams.get("autoplay"), "0");
  assert.equal(source.searchParams.get("mute"), "1");
  assert.equal(source.searchParams.get("enablejsapi"), "1");
  assert.equal(source.searchParams.get("controls"), "1");
  assert.ok(host.querySelector('[data-youtube-player]').className.includes("min-h-[200px]"));
  await action(() => player.emit("onStateChange", 1));
  assert.equal(host.querySelector("button"), null, "state arriving before readiness must not enable commands");
  await action(() => player.emit("onReady"));
  assert.deepEqual(player.calls.slice(0, 3), [["setVolume", 20], ["unMute"], ["playVideo"]]);
  assert.ok(host.textContent.includes("Volume 20%"));
  assert.equal(host.querySelector('button[aria-pressed="true"]').textContent, "Disattiva audio");
  await action(() => player.emit("onReady"));
  assert.equal(player.calls.filter(call => call[0] === "setVolume").length, 1, "duplicate readiness must not reset a visitor's volume");
});

test("blocked audible autoplay retries muted once, then offers user play and low-volume sound", async context => {
  const { host, player } = await mount(context);
  await action(() => player.emit("onReady"));
  await action(() => player.emit("onAutoplayBlocked"));
  assert.deepEqual(player.calls.slice(-2), [["mute"], ["playVideo"]]);
  const enable = [...host.querySelectorAll("button")].find(button => button.textContent === "Attiva audio · 20%");
  assert.ok(enable);
  await action(() => player.emit("onAutoplayBlocked"));
  assert.ok([...host.querySelectorAll("button")].some(button => button.textContent === "Riproduci video"));
  await action(() => enable.click());
  assert.deepEqual(player.calls.slice(-3), [["setVolume", 20], ["unMute"], ["playVideo"]]);
  await action(() => player.emit("onStateChange", 1));
  assert.equal([...host.querySelectorAll("button")].some(button => button.textContent === "Riproduci video"), false);
  await action(() => host.querySelector("button").click());
  assert.equal(player.calls.at(-1)[0], "mute");
});

test("visitor volume and native mute changes are reflected without repeatedly forcing 20 percent", async context => {
  const { host, player } = await mount(context);
  await action(() => player.emit("onReady"));
  player.volume = 63;
  await act(async () => { await new Promise(resolve => dom.window.setTimeout(resolve, 800)); });
  assert.ok(host.textContent.includes("Volume 63%"));
  player.muted = true;
  await act(async () => { await new Promise(resolve => dom.window.setTimeout(resolve, 800)); });
  assert.ok(host.textContent.includes("Attiva audio · 20%"));
  assert.equal(player.calls.filter(call => call[0] === "setVolume").length, 1);
});

test("devices that cannot set software volume stay muted until an explicit sound choice and make no 20-percent promise", async context => {
  const prototype = dom.window.HTMLMediaElement.prototype;
  const previous = Object.getOwnPropertyDescriptor(prototype, "volume");
  Object.defineProperty(prototype, "volume", { configurable: true, get: () => 1, set() {} });
  context.after(() => Object.defineProperty(prototype, "volume", previous));
  const { host, player } = await mount(context);
  await action(() => player.emit("onReady"));
  assert.deepEqual(player.calls, [["mute"], ["playVideo"]]);
  assert.equal(host.textContent.includes("20%"), false);
  assert.ok(host.textContent.includes("tasti del telefono"));
  assert.equal(host.querySelector("button").textContent, "Attiva audio");
  await action(() => host.querySelector("button").click());
  assert.deepEqual(player.calls.slice(-2), [["unMute"], ["playVideo"]]);
  assert.equal(host.textContent.includes("20%"), false);
});

for (const [locale, volume, enable] of [["en", "Volume 20%", "Turn sound on · 20%"], ["de", "Lautstärke 20%", "Ton einschalten · 20%"], ["es", "Volumen 20%", "Activar sonido · 20%"]]) {
  test(`${locale}: controls and actual-volume status use the selected language`, async context => {
    const { host, player } = await mount(context, { locale });
    await action(() => player.emit("onReady"));
    assert.ok(host.textContent.includes(volume));
    await action(() => player.emit("onAutoplayBlocked"));
    assert.ok(host.textContent.includes(enable));
  });
}

test("StrictMode cleanup destroys only owned frames and late player callbacks cannot restart sound", async context => {
  const { host, root, player } = await mount(context, { strict: true });
  await action(() => player.emit("onReady"));
  await action(() => root.unmount());
  const count = player.calls.length;
  await action(() => { player.emit("onReady"); player.emit("onAutoplayBlocked"); player.emit("onStateChange", 1); });
  assert.equal(host.querySelector("iframe"), null);
  assert.equal(player.calls.at(-1)[0], "destroy");
  assert.equal(player.calls.length, count);
});

test("two consented players share one pending API script, canceled listeners ignore late readiness, and failures can retry", () => {
  const browser = new JSDOM("<head></head><body></body>", { url: "https://meraki.test" }).window;
  try {
    const previousCalls = [];
    const previous = () => previousCalls.push("ready");
    browser.onYouTubeIframeAPIReady = previous;
    const { subscribeYoutubeApi } = load("lib/events/youtube-player-api.ts", {}, browser);
    const ready = [], errors = [];
    const cancelFirst = subscribeYoutubeApi(() => ready.push("first"), () => errors.push("first"));
    const cancelSecond = subscribeYoutubeApi(() => ready.push("second"), () => errors.push("second"));
    assert.equal(browser.document.querySelectorAll("script").length, 1);
    const staleReady = browser.onYouTubeIframeAPIReady;
    cancelFirst(); browser.YT = { Player: FakePlayer };
    staleReady();
    assert.deepEqual(ready, ["second"]);
    assert.deepEqual(previousCalls, ["ready"]);
    assert.equal(browser.onYouTubeIframeAPIReady, previous);
    assert.equal(browser.document.querySelector("script"), null);
    cancelSecond(); staleReady();
    assert.deepEqual(previousCalls, ["ready"]);
    delete browser.YT;
    const cancelFailure = subscribeYoutubeApi(() => {}, () => errors.push("failed"));
    browser.document.querySelector("script").dispatchEvent(new browser.Event("error"));
    assert.deepEqual(errors, ["failed"]);
    cancelFailure();
    const cancelRetry = subscribeYoutubeApi(() => ready.push("retry"), () => {});
    assert.ok(browser.document.querySelector("script"));
    const late = browser.onYouTubeIframeAPIReady;
    cancelRetry();
    assert.equal(browser.document.querySelector("script"), null);
    browser.YT = { Player: FakePlayer }; late();
    assert.deepEqual(ready, ["second"]);
    assert.equal(browser.onYouTubeIframeAPIReady, previous);
  } finally { browser.close(); }
});
