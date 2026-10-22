export type YoutubePlayerHandle = {
  setVolume(value: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  playVideo(): void;
  getPlayerState(): number;
  destroy(): void;
};
export type YoutubePlayerEvent = { target: YoutubePlayerHandle; data?: number };
export type YoutubeApi = {
  Player: new (element: HTMLElement, options: { events: {
    onReady(event: YoutubePlayerEvent): void;
    onStateChange(event: YoutubePlayerEvent): void;
    onAutoplayBlocked(event: YoutubePlayerEvent): void;
    onError(event: YoutubePlayerEvent): void;
  } }) => YoutubePlayerHandle;
};
type YoutubeWindow = Window & { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void };
type Subscriber = { ready(api: YoutubeApi): void; error(): void; active: boolean };
type Pending = { window: YoutubeWindow; script: HTMLScriptElement; subscribers: Set<Subscriber>; timer: number; previous?: () => void; ready: () => void; fail: () => void };
let pending: Pending | undefined;

/** The caller mounts only after consent. No script or player is loaded at import time. */
export function subscribeYoutubeApi(ready: Subscriber["ready"], error: Subscriber["error"]): () => void {
  const browser = window as YoutubeWindow;
  const subscriber = { ready, error, active: true };
  if (browser.YT?.Player) {
    const timer = browser.setTimeout(() => { if (subscriber.active && browser.YT) ready(browser.YT); }, 0);
    return () => { subscriber.active = false; browser.clearTimeout(timer); };
  }
  if (!pending) {
    const script = browser.document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.merakiYoutubeApi = "true";
    const current: Pending = { window: browser, script, subscribers: new Set(), timer: 0, previous: browser.onYouTubeIframeAPIReady, ready: () => {}, fail: () => {} };
    const finish = (api?: YoutubeApi) => {
      if (pending !== current) return;
      pending = undefined;
      browser.clearTimeout(current.timer);
      script.removeEventListener("error", current.fail);
      if (browser.onYouTubeIframeAPIReady === current.ready) browser.onYouTubeIframeAPIReady = current.previous;
      script.remove();
      for (const listener of current.subscribers) if (listener.active) {
        if (api) listener.ready(api); else listener.error();
      }
      current.subscribers.clear();
    };
    current.ready = () => {
      if (pending !== current) return;
      try { current.previous?.(); } catch { /* Another embed must not prevent this player from loading. */ }
      if (browser.YT?.Player) finish(browser.YT);
    };
    current.fail = () => finish();
    pending = current;
    browser.onYouTubeIframeAPIReady = current.ready;
    script.addEventListener("error", current.fail);
    current.timer = browser.setTimeout(current.fail, 15_000);
    browser.document.head.append(script);
  }
  const current = pending;
  current.subscribers.add(subscriber);
  return () => {
    subscriber.active = false;
    current.subscribers.delete(subscriber);
    if (pending === current && !current.subscribers.size) {
      pending = undefined;
      current.window.clearTimeout(current.timer);
      current.script.removeEventListener("error", current.fail);
      current.script.remove();
      if (current.window.onYouTubeIframeAPIReady === current.ready) current.window.onYouTubeIframeAPIReady = current.previous;
    }
  };
}
