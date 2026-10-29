import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { youtubeModule as youtube } from "./helpers/youtube-modules.mjs";
import { nativeVideoModule, nativeVideoFixtureUrl } from "./helpers/native-video-modules.mjs";

const require = createRequire(import.meta.url);
const id = "Ut08j478Ypg";
const canonical = `https://www.youtube.com/watch?v=${id}`;
function load(file, mocks = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, URL, Intl, ...globals, require: name => name in mocks ? mocks[name] : require(name) });
  return compiled.exports;
}

test("only supported HTTPS single-video YouTube links normalize to a canonical ID", () => {
  for (const url of [canonical, `https://youtube.com/watch?feature=shared&v=${id}`, `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=tracking`, `https://www.youtu.be/${id}/`, `https://www.youtube.com/shorts/${id}`, `https://youtube.com/embed/${id}/?autoplay=0`, ` ${canonical} `]) {
    assert.equal(youtube.youtubeVideoId(url), id, url);
    assert.equal(youtube.normalizeYoutubeUrl(url), canonical);
    const embed = new URL(youtube.youtubeEmbedUrl(url));
    assert.equal(embed.origin, "https://www.youtube-nocookie.com");
    assert.equal(embed.pathname, `/embed/${id}`);
    for (const key of ["autoplay", "mute", "playsinline", "controls"]) assert.equal(embed.searchParams.get(key), "1");
    assert.equal(embed.searchParams.has("si"), false);
  }
  for (const url of [undefined, null, "", id, "javascript:alert(1)", `http://youtu.be/${id}`, `https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/embed/${id}`, `https://youtube.com@evil.test/watch?v=${id}`, `https://user:secret@youtube.com/watch?v=${id}`, `https://youtu.be:444/${id}`, `//youtu.be/${id}`, `<iframe src="${canonical}"></iframe>`, `https://youtu.be/${id}x`, `https://youtube.com/watch?v=${id}&v=abcdefghijk`, "https://youtube.com/playlist?list=example", `https://www.youtube-nocookie.com/embed/${id}`, `https://you\ntube.com/watch?v=${id}`, `https://youtu.be/${id}/next`]) {
    assert.equal(youtube.normalizeYoutubeUrl(url), null, String(url));
    assert.equal(youtube.youtubeEmbedUrl(url), null);
  }
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://meraki.test/it/eventi/vibra", pretendToBeVisual: true });
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
const cookies = load("lib/facebook-pixel.ts");
const { EventVideo } = load("components/meraki/event-video.tsx", { "@/lib/events/youtube": youtube, "@/lib/events/native-video": nativeVideoModule, "@/lib/facebook-pixel": cookies, "./native-video-player": { NativeVideoPlayer: ({ src, title }) => React.createElement("video", { src, "aria-label": title, muted: true, controls: true }) }, "./youtube-player": { YoutubePlayer: ({ embed, title }) => React.createElement("div", { "data-audio-player": true }, React.createElement("iframe", { src: embed, title: `${title} · YouTube`, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowFullScreen: true })) } }, { window: dom.window });
async function mount(context, props = {}, consent) {
  dom.window.localStorage.clear();
  if (consent !== undefined) dom.window.localStorage.setItem(cookies.COOKIE_CONSENT_KEY, typeof consent === "string" ? consent : JSON.stringify(consent));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => { root.render(React.createElement(EventVideo, { url: canonical, locale: "it", ...props })); });
  await act(async () => { await new Promise(resolve => dom.window.setTimeout(resolve, 1)); });
  context.after(async () => { await act(async () => root.unmount()); host.remove(); });
  return { host, root, render: async (next) => act(async () => root.render(React.createElement(EventVideo, { url: canonical, locale: "it", ...next }))) };
}
const translations = {
  it: ["Scopri cosa ti aspetta", "Guarda il video", "Il video dell’esperienza"],
  en: ["See what awaits you", "Watch the video", "Experience video"],
  de: ["Entdecke, was dich erwartet", "Video ansehen", "Einblick im Video"],
  es: ["Descubre lo que te espera", "Ver el vídeo", "El vídeo de la experiencia"],
};

function observeNativeVideo(context) {
  const previous = Object.getOwnPropertyDescriptor(dom.window, "IntersectionObserver");
  const observers = [];
  dom.window.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    notify(isIntersecting) { this.callback([{ target: this.target, isIntersecting }], this); }
  };
  context.after(() => {
    if (previous) Object.defineProperty(dom.window, "IntersectionObserver", previous);
    else delete dom.window.IntersectionObserver;
  });
  return observers;
}

test("native video stays resource-free offscreen, starts once near the viewport and supports close/reopen", async context => {
  const observers = observeNativeVideo(context);
  const { host } = await mount(context, { videoUrl: nativeVideoFixtureUrl });
  assert.equal(observers.length, 1);
  const observer = observers[0];
  assert.equal(observer.options.rootMargin, "200px 0px");
  assert.ok(observer.target.querySelector("[data-native-video-placeholder].aspect-video"));
  assert.equal(host.querySelector("video,source,iframe,img,script"), null);
  assert.equal(host.innerHTML.includes(nativeVideoFixtureUrl), false, "offscreen markup cannot initiate an MP4 request");
  await act(async () => observer.notify(false));
  assert.equal(host.querySelector("video"), null);
  await act(async () => observer.notify(true));
  const firstPlayer = host.querySelector("video");
  assert.equal(firstPlayer.src, nativeVideoFixtureUrl);
  assert.equal(observer.disconnected, true);
  await act(async () => observer.notify(false));
  assert.equal(host.querySelector("video"), firstPlayer, "leaving the viewport must not remount or restart playback");
  await act(async () => host.querySelector('button[aria-label="Chiudi il video"]').click());
  assert.equal(host.querySelector("video"), null);
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Guarda il video").click());
  assert.equal(host.querySelector("video").src, nativeVideoFixtureUrl);
  assert.equal(observers.length, 1, "reopening uses the already admitted player without another observer");
});

test("native video disconnects an unused observer and ignores queued callbacks after unmount", async context => {
  const observers = observeNativeVideo(context);
  const { host, render } = await mount(context, { videoUrl: nativeVideoFixtureUrl });
  const observer = observers[0];
  await render({ url: null, videoUrl: null });
  assert.equal(observer.disconnected, true);
  await act(async () => observer.notify(true));
  assert.equal(host.innerHTML, "");
});

test("near-viewport activation preserves keyboard focus when it replaces the focused watch button", async context => {
  const observers = observeNativeVideo(context);
  const { host } = await mount(context, { videoUrl: nativeVideoFixtureUrl });
  const watch = [...host.querySelectorAll("button")].find(button => button.textContent === "Guarda il video");
  watch.focus();
  assert.equal(document.activeElement, watch);
  await act(async () => observers[0].notify(true));
  const group = host.querySelector('[role="group"]');
  assert.equal(document.activeElement, group);
  assert.ok(group.contains(host.querySelector("video")));
  assert.equal(document.getElementById(group.getAttribute("aria-labelledby")).textContent, "Scopri cosa ti aspetta");
});

test("near-viewport activation does not take focus from another part of the page", async context => {
  const observers = observeNativeVideo(context);
  const { host } = await mount(context, { videoUrl: nativeVideoFixtureUrl });
  const elsewhere = document.createElement("button");
  elsewhere.textContent = "Continua la lettura";
  document.body.append(elsewhere);
  context.after(() => elsewhere.remove());
  elsewhere.focus();
  await act(async () => observers[0].notify(true));
  assert.ok(host.querySelector("video"));
  assert.equal(document.activeElement, elsewhere);
});

test("an explicit watch action can start an offscreen native video without waiting for the observer", async context => {
  const observers = observeNativeVideo(context);
  const { host } = await mount(context, { videoUrl: nativeVideoFixtureUrl });
  const watch = [...host.querySelectorAll("button")].find(button => button.textContent === "Guarda il video");
  watch.focus();
  await act(async () => watch.click());
  assert.equal(host.querySelector("video").src, nativeVideoFixtureUrl);
  assert.equal(observers[0].disconnected, true);
  assert.equal(document.activeElement, host.querySelector('[role="group"]'));
});

for (const [locale, [heading, watch, videoLabel]] of Object.entries(translations)) {
  test(`${locale}: first-party MP4 keeps the unsupported-observer fallback without YouTube or a consent gate`, async context => {
    const { host } = await mount(context, { videoUrl: nativeVideoFixtureUrl, locale }, { marketing: false });
    assert.equal(host.querySelector("video").src, nativeVideoFixtureUrl);
    assert.equal(host.querySelector("h2").textContent, heading);
    assert.ok(host.textContent.includes(videoLabel));
    assert.equal(host.querySelector("iframe,script,a"), null);
    assert.doesNotMatch(host.textContent, /YouTube/);
    await act(async () => host.querySelector("video").dispatchEvent(new dom.window.Event("error")));
    assert.equal(host.querySelector("iframe"), null, "native failures must never silently contact YouTube");
    await act(async () => host.querySelector("button[aria-label]").click());
    assert.equal(host.querySelector("video"), null);
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === watch).click());
    assert.equal(host.querySelector("video").src, nativeVideoFixtureUrl);
    const html = renderToStaticMarkup(React.createElement(EventVideo, { url: canonical, videoUrl: nativeVideoFixtureUrl, locale }));
    assert.ok(html.includes("data-native-video-placeholder"));
    assert.doesNotMatch(html, /<video|<source|src=/);
    assert.equal(html.includes(nativeVideoFixtureUrl), false, "server rendering must never preload the MP4");
    assert.doesNotMatch(html, /YouTube|youtube|<iframe|<script/);
  });
  test(`${locale}: player is gated without remote thumbnails and one-page permission does not change cookie consent`, async context => {
    const { host } = await mount(context, { locale }, { necessary: true, analytics: false, marketing: false });
    assert.equal(host.querySelector("h2").textContent, heading);
    assert.ok(host.textContent.includes(videoLabel));
    const external = host.querySelector('a[target="_blank"]');
    assert.ok(external.classList.contains("rounded-full"));
    assert.ok(external.classList.contains("min-h-12"));
    assert.equal(external.querySelectorAll("svg").length, 2);
    assert.doesNotMatch(external.textContent, /↗|↗️/);
    assert.equal(host.querySelector("iframe,img,script"), null);
    assert.ok(host.querySelector(".aspect-video"));
    const before = dom.window.localStorage.getItem(cookies.COOKIE_CONSENT_KEY);
    const events = [];
    const onConsent = event => events.push(event);
    dom.window.addEventListener(cookies.COOKIE_CONSENT_CHANGED_EVENT, onConsent);
    context.after(() => dom.window.removeEventListener(cookies.COOKIE_CONSENT_CHANGED_EVENT, onConsent));
    const button = [...host.querySelectorAll("button")].find(button => button.textContent === watch);
    assert.ok(button);
    await act(async () => button.click());
    const frame = host.querySelector("iframe");
    assert.ok(frame);
    assert.equal(frame.src, youtube.youtubeEmbedUrl(canonical));
    assert.equal(frame.getAttribute("allow").includes("autoplay"), true);
    assert.ok(frame.hasAttribute("allowfullscreen"));
    assert.ok(host.textContent.includes(videoLabel));
    assert.equal(dom.window.localStorage.getItem(cookies.COOKIE_CONSENT_KEY), before);
    assert.equal(events.length, 0);
    assert.equal(dom.window.fbq, undefined);
    assert.equal(host.querySelector('a[target="_blank"]').href, canonical);
    await act(async () => host.querySelector("button[aria-label]").click());
    assert.equal(host.querySelector("iframe"), null);
  });
}

test("saved cookie permission mounts the audio-enabled player; same-tab and cross-tab revocation remove the frame", async context => {
  const { host } = await mount(context, {}, { marketing: true });
  assert.ok(host.querySelector("iframe"));
  await act(async () => dom.window.dispatchEvent(new dom.window.CustomEvent(cookies.COOKIE_CONSENT_CHANGED_EVENT, { detail: { marketing: false } })));
  assert.equal(host.querySelector("iframe"), null);
  await act(async () => host.querySelector("button").click());
  assert.ok(host.querySelector("iframe"));
  dom.window.localStorage.setItem(cookies.COOKIE_CONSENT_KEY, JSON.stringify({ marketing: false }));
  await act(async () => dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: cookies.COOKIE_CONSENT_KEY })));
  assert.equal(host.querySelector("iframe"), null);
  await act(async () => dom.window.dispatchEvent(new dom.window.CustomEvent(cookies.COOKIE_CONSENT_CHANGED_EVENT, { detail: { marketing: true } })));
  assert.ok(host.querySelector("iframe"));
});

test("no permission, malformed consent, or invalid URLs never load remote content; SSR stays gated", async context => {
  for (const consent of [undefined, {}, { marketing: "true" }, { analytics: true }, "{broken"]) {
    const { host } = await mount(context, {}, consent);
    assert.equal(host.querySelector("iframe,img,script"), null);
  }
  const { host, render } = await mount(context);
  for (const url of [undefined, null, "", "https://evil.test/embed/abcdefghijk"]) {
    await render({ url });
    assert.equal(host.innerHTML, "");
  }
  const html = renderToStaticMarkup(React.createElement(EventVideo, { url: canonical, locale: "en", title: '<script>alert("x")</script>' }));
  assert.doesNotMatch(html, /<iframe|<img|<script|src=/);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("changing videos drops the one-page permission rather than silently authorizing another video", async context => {
  const { host, render } = await mount(context);
  await act(async () => host.querySelector("button").click());
  assert.ok(host.querySelector("iframe"));
  await render({ url: "https://youtu.be/abcdefghijk" });
  assert.equal(host.querySelector("iframe"), null);
});

test("event and workshop detail routes load only the selected video title language", async () => {
  const titles = { it: "Un assaggio dell’esperienza", en: "A taste of the experience", de: "Ein Vorgeschmack auf das Erlebnis", es: "Una muestra de la experiencia" };
  const i18n = load("lib/i18n-utils.ts");
  for (const route of ["eventi", "workshop"]) for (const locale of Object.keys(titles)) {
    const selected = [];
    const row = { youtube_url: canonical, video_url: nativeVideoFixtureUrl, video_titolo: titles, descrizione: { it: "Descrizione" }, cta_tipo: "stripe", cta_url: null };
    const page = load(`app/[locale]/(public)/${route}/[slug]/page.tsx`, {
      "next/navigation": { notFound() { throw Error("No event"); } },
      "@/lib/supabase/server": { createClient: async () => ({ from() { return { select(value) { selected.push(value); return this; }, eq() { return this; }, in() { return this; }, async single() { return { data: row }; } }; } }) },
      "@/lib/i18n-utils": i18n,
      "@/components/meraki/event-detail": { EventDetail: () => null },
      "@/components/meraki/events-data": { eventFeedColumns: "id", toMerakiEvent: () => ({ id: "event" }) },
      "@/lib/events/logistics": { parseEventLogistics: () => null },
      "@/lib/events/affiliates": { publicEventAffiliates: () => [] },
      "@/lib/events/social-data": { getSocialEvent: async () => null },
      "@/lib/events/social-metadata": {},
      "@/lib/commerce/config": { parseCommerceConfig: () => null },
      "@/lib/events/canceled-public-event": { getCanceledPublicEvent: async () => null },
      "@/components/meraki/canceled-event": {},
      "@/lib/events/cancellation-copy": {},
    });
    const element = await page.default({ params: Promise.resolve({ slug: "sample", locale }) });
    assert.equal(element.props.event.youtubeUrl, canonical);
    assert.equal(element.props.event.videoUrl, nativeVideoFixtureUrl);
    assert.equal(element.props.event.videoTitle, titles[locale]);
    assert.ok(selected[0].includes("youtube_url, video_titolo"));
    assert.equal(JSON.stringify(element.props.event).includes(titles[locale === "it" ? "de" : "it"]), false);
  }
});

test("the video sits immediately below the intact poster and before other event information", () => {
  const { EventDetail } = load("components/meraki/event-detail.tsx", {
    "@/i18n/routing": { Link: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/public/event-description": { EventDescription: () => null },
    "@/lib/tickets/event-availability": { getEventAvailability: () => ({ isEnded: false, salesClosed: false }) },
    "@/app/[locale]/(public)/eventi/[slug]/checkout-button": { CheckoutButton: () => null },
    "./commerce-purchase": { CommercePurchase: () => null },
    "./event-poster": { EventPoster: () => React.createElement("div", { "data-poster": true, className: "aspect-[4/5]" }) },
    "./event-video": { EventVideo },
    "./event-logistics-section": { EventLogisticsSection: () => null, eventLogisticsLabels: () => ({}) },
    "@/lib/events/logistics": { hasEventLogistics: () => false },
    "./event-model": { availablePlaces: () => null, eventDate: () => "19/12/2026", eventPrice: () => "35 €", eventLabels: () => ({}) },
    "./event-activity-schedule": { EventActivitySchedule: () => null, hasActivitySchedule: () => false },
  });
  for (const locale of Object.keys(translations)) {
    const event = { id: "event", title: "Sample", type: "evento", startsAt: "2026-12-19T11:30:00Z", price: 3500, youtubeUrl: canonical, videoTitle: `Title ${locale}` };
    const fragment = JSDOM.fragment(renderToStaticMarkup(React.createElement(EventDetail, { event, locale })));
    const poster = fragment.querySelector("[data-poster]");
    assert.ok(poster.classList.contains("aspect-[4/5]"));
    assert.ok(poster.nextElementSibling.hasAttribute("data-event-video"));
    assert.equal(poster.nextElementSibling.querySelector("h2").textContent, `Title ${locale}`);
    assert.equal(fragment.querySelector("iframe"), null, "server HTML must not start YouTube before consent");
  }
});
