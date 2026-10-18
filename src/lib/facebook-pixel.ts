export const COOKIE_CONSENT_KEY = "meraki_cookie_consent";
export const COOKIE_CONSENT_CHANGED_EVENT = "meraki-cookie-consent-changed";
const PIXEL_ID = "4287498058183493";

type PixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void; queue: unknown[][];
  push?: PixelFunction; loaded?: boolean; version?: string;
};
type PixelWindow = Window & { fbq?: PixelFunction; _fbq?: PixelFunction };
type PixelState = { loaded: boolean; initialized: boolean; lastPageView: string | null; consentOverride?: boolean; script?: HTMLScriptElement };
const states = new WeakMap<Window, PixelState>();

export function facebookPixelActive(browser: Window) {
  return Boolean(states.get(browser)?.initialized || (browser as PixelWindow).fbq);
}

export function privatePixelLocation(href: string) {
  try {
    const url = new URL(href);
    const pathname = decodeURIComponent(url.pathname);
    return /\/(?:biglietto|biglietti|pagamento|admin)(?:\/|$)/.test(pathname)
      || /\/profilo\/preferenze(?:\/|$)/.test(pathname)
      || Array.from(url.searchParams.keys()).some((key) => ["token", "session_id"].includes(key.toLowerCase()));
  } catch { return true; }
}

export function storedMarketingConsent(browser: Window) {
  try { return JSON.parse(browser.localStorage.getItem(COOKIE_CONSENT_KEY) || "null")?.marketing === true; }
  catch { return false; }
}

/** The only place that loads, initializes or tracks the pixel. No personal form data is supplied. */
export function synchronizeFacebookPixel(browser: Window, consentOverride?: boolean) {
  const pixelWindow = browser as PixelWindow;
  let state = states.get(browser);
  if (!state) { state = { loaded: false, initialized: false, lastPageView: null }; states.set(browser, state); }
  if (typeof consentOverride === "boolean") state.consentOverride = consentOverride;
  const allowed = (state.consentOverride ?? storedMarketingConsent(browser)) && !privatePixelLocation(browser.location.href);
  if (!allowed) {
    state.lastPageView = null;
    pixelWindow.fbq?.("consent", "revoke");
    if (privatePixelLocation(browser.location.href) && facebookPixelActive(browser)) {
      state.script?.remove();
      return true;
    }
    return false;
  }

  if (!pixelWindow.fbq) {
    const pixel = function (...args: unknown[]) {
      if (pixel.callMethod) pixel.callMethod(...args);
      else pixel.queue.push(args);
    } as PixelFunction;
    pixel.queue = []; pixel.push = pixel; pixel.loaded = true; pixel.version = "2.0";
    pixelWindow.fbq = pixel; pixelWindow._fbq = pixelWindow._fbq || pixel;
  }
  const pixel = pixelWindow.fbq;
  if (!state.initialized) {
    // Manual-only mode prevents automatic collection from checkout/contact fields.
    pixel("consent", "revoke");
    pixel("set", "autoConfig", false, PIXEL_ID);
    pixel("init", PIXEL_ID);
    state.initialized = true;
    state.loaded = typeof pixel.callMethod === "function";
  }
  if (!state.loaded) {
    if (!state.script) {
      const script = browser.document.createElement("script");
      script.id = "meraki-facebook-pixel"; script.async = true; script.referrerPolicy = "no-referrer";
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      const currentState = state;
      script.onload = () => {
        currentState.loaded = true;
        // The user may have navigated to a ticket or revoked consent while loading.
        synchronizeFacebookPixel(browser);
      };
      script.onerror = () => { script.remove(); currentState.script = undefined; currentState.loaded = false; };
      state.script = script;
      browser.document.head.appendChild(script);
    }
    // Never queue PageView before the load callback rechecks the actual URL.
    return false;
  }
  pixel("consent", "grant");
  if (state.lastPageView !== browser.location.href) {
    pixel("track", "PageView");
    state.lastPageView = browser.location.href;
  }
  return false;
}
