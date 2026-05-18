"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function FacebookPixelEvents() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined" && typeof (window as any).fbq === "function") {
      try {
        const consent = localStorage.getItem("meraki_cookie_consent");
        if (consent) {
          const parsed = JSON.parse(consent);
          if (parsed.marketing) {
            (window as any).fbq("consent", "grant");
            (window as any).fbq("track", "PageView");
          }
        }
      } catch (e) {
        console.error("FB Pixel Error:", e);
      }
    }
  }, [pathname, searchParams]);

  return null;
}
