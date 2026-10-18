"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { COOKIE_CONSENT_CHANGED_EVENT, COOKIE_CONSENT_KEY, facebookPixelActive, privatePixelLocation, storedMarketingConsent, synchronizeFacebookPixel } from "@/lib/facebook-pixel";

export function FacebookPixelEvents() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const sync = (consent?: boolean) => {
      // A fresh document clears any SDK already loaded on a public page.
      if (synchronizeFacebookPixel(window, consent)) window.location.replace(window.location.href);
    };
    const onConsent = (event: Event) => sync((event as CustomEvent<{ marketing?: boolean }>).detail?.marketing === true);
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === COOKIE_CONSENT_KEY) sync(storedMarketingConsent(window)); };
    const onPrivateLink = (event: MouseEvent) => {
      if (!facebookPixelActive(window) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !privatePixelLocation(url.href)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.location.assign(url.href);
    };
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsent);
    window.addEventListener("storage", onStorage);
    document.addEventListener("click", onPrivateLink, true);
    sync();
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsent);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("click", onPrivateLink, true);
    };
  }, [pathname, searchParams]);

  return null;
}
