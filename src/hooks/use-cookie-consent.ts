"use client";

import { useState, useEffect } from "react";
import { COOKIE_CONSENT_CHANGED_EVENT, COOKIE_CONSENT_KEY } from "@/lib/facebook-pixel";

export type CookiePreferences = {
  necessary: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_KEY = COOKIE_CONSENT_KEY;

export function useCookieConsent() {
  const [hasConsented, setHasConsented] = useState<boolean>(true); // Default true server-side to prevent hydration mismatch, set false in useEffect
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let storedConsent: string | null = null;
      try { storedConsent = localStorage.getItem(CONSENT_KEY); } catch { /* Storage can be unavailable in private browsing. */ }
      if (storedConsent) {
        try {
          const parsed = JSON.parse(storedConsent);
          setPreferences(parsed);
          setHasConsented(true);
        } catch {
          setHasConsented(false);
        }
      } else {
        setHasConsented(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const savePreferences = (newPreferences: CookiePreferences) => {
    // Ensure necessary is always true
    const toSave = { ...newPreferences, necessary: true };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(toSave)); } catch { /* The current tab still honours the user's choice. */ }
    setPreferences(toSave);
    setHasConsented(true);

    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: toSave }));
  };

  const acceptAll = () => {
    savePreferences({ necessary: true, analytics: true, marketing: true });
  };

  const rejectAll = () => {
    savePreferences({ necessary: true, analytics: false, marketing: false });
  };

  return {
    hasConsented,
    preferences,
    savePreferences,
    acceptAll,
    rejectAll,
  };
}
