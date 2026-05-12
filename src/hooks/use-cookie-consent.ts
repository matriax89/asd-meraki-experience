"use client";

import { useState, useEffect } from "react";

export type CookiePreferences = {
  necessary: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
};

const CONSENT_KEY = "meraki_cookie_consent";

export function useCookieConsent() {
  const [hasConsented, setHasConsented] = useState<boolean>(true); // Default true server-side to prevent hydration mismatch, set false in useEffect
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const storedConsent = localStorage.getItem(CONSENT_KEY);
    if (storedConsent) {
      try {
        const parsed = JSON.parse(storedConsent);
        setPreferences(parsed);
        setHasConsented(true);
      } catch (e) {
        setHasConsented(false);
      }
    } else {
      setHasConsented(false);
    }
  }, []);

  const savePreferences = (newPreferences: CookiePreferences) => {
    // Ensure necessary is always true
    const toSave = { ...newPreferences, necessary: true };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(toSave));
    setPreferences(toSave);
    setHasConsented(true);
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
