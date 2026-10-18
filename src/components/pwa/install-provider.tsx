"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallResult = "accepted" | "dismissed" | "unavailable";

interface InstallContextValue {
  canPrompt: boolean;
  installed: boolean;
  installing: boolean;
  install(): Promise<InstallResult>;
}

const InstallContext = createContext<InstallContextValue | null>(null);

// Capture the browser's one-use install event at the layout level, including
// when a visitor reaches the event list through client-side navigation.
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const prompting = useRef(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallResult> => {
    if (!promptEvent || prompting.current) return "unavailable";

    prompting.current = true;
    setInstalling(true);
    // A beforeinstallprompt event can only be used once.
    setPromptEvent(null);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") setInstalled(true);
      return outcome;
    } catch {
      return "unavailable";
    } finally {
      prompting.current = false;
      setInstalling(false);
    }
  }, [promptEvent]);

  const value = useMemo(
    () => ({ canPrompt: promptEvent !== null, installed, installing, install }),
    [promptEvent, installed, installing, install],
  );

  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error("useInstall must be used inside InstallProvider");
  return context;
}
