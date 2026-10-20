"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Download, Smartphone } from "lucide-react";
import { useInstall } from "./install-provider";

type Platform = "server" | "standalone" | "ios-safari" | "ios-other" | "android" | "other";

function subscribePlatform(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getPlatform(): Platform {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone) {
    return "standalone";
  }
  if (!window.isSecureContext) return "other";

  const userAgent = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
      ? "ios-safari"
      : "ios-other";
  }
  return /Android/.test(userAgent) ? "android" : "other";
}

const getServerPlatform = (): Platform => "server";

const copy = {
  it: {
    title: "Meraki, sempre a portata di mano",
    description: "Aggiungi Meraki alla schermata Home per ritrovare gli eventi con un tocco.",
    install: "Installa Meraki",
    installing: "Installazione…",
    help: "Come aggiungere Meraki",
    iosSafari: "In Safari, tocca Condividi e poi Aggiungi alla schermata Home. Conferma con Aggiungi.",
    iosOther: "Apri questa pagina in Safari, tocca Condividi e poi Aggiungi alla schermata Home. Conferma con Aggiungi.",
    android: "Apri il menu del browser e scegli Installa app oppure Aggiungi a schermata Home. Se l’opzione non compare, apri questa pagina in Chrome.",
    desktop: "Puoi installare Meraki dal menu del browser, quando l’opzione è disponibile.",
    dismissed: "Puoi aggiungere Meraki in un secondo momento dal menu del browser.",
    unavailable: "Usa le istruzioni qui sotto per aggiungere Meraki alla schermata Home.",
    connection: "Per acquistare e aggiornare i biglietti serve una connessione Internet. Puoi salvare il QR sul telefono per mostrarlo all’ingresso.",
  },
  en: {
    title: "Keep Meraki close at hand",
    description: "Add Meraki to your Home Screen to find events with one tap.",
    install: "Install Meraki",
    installing: "Installing…",
    help: "How to add Meraki",
    iosSafari: "In Safari, tap Share, then Add to Home Screen. Confirm with Add.",
    iosOther: "Open this page in Safari, tap Share, then Add to Home Screen. Confirm with Add.",
    android: "Open your browser menu and choose Install app or Add to Home screen. If this option is missing, open this page in Chrome.",
    desktop: "You can install Meraki from your browser menu when the option is available.",
    dismissed: "You can add Meraki later from your browser menu.",
    unavailable: "Follow the instructions below to add Meraki to your Home Screen.",
    connection: "An Internet connection is needed to buy and refresh tickets. You can save the QR code on your phone to show it at the entrance.",
  },
  de: {
    title: "Meraki immer griffbereit",
    description: "Füge Meraki zum Home-Bildschirm hinzu und finde Veranstaltungen mit einem Tippen.",
    install: "Meraki installieren",
    installing: "Installation…",
    help: "So fügst du Meraki hinzu",
    iosSafari: "Tippe in Safari auf Teilen und dann auf Zum Home-Bildschirm. Bestätige mit Hinzufügen.",
    iosOther: "Öffne diese Seite in Safari, tippe auf Teilen und dann auf Zum Home-Bildschirm. Bestätige mit Hinzufügen.",
    android: "Öffne das Browsermenü und wähle App installieren oder Zum Startbildschirm hinzufügen. Falls die Option fehlt, öffne diese Seite in Chrome.",
    desktop: "Du kannst Meraki über das Browsermenü installieren, wenn die Option verfügbar ist.",
    dismissed: "Du kannst Meraki später über das Browsermenü hinzufügen.",
    unavailable: "Folge der Anleitung unten, um Meraki zum Home-Bildschirm hinzuzufügen.",
    connection: "Zum Kaufen und Aktualisieren der Tickets ist eine Internetverbindung erforderlich. Speichere den QR-Code auf deinem Handy, um ihn am Eingang vorzuzeigen.",
  },
  es: {
    title: "Meraki, siempre a mano",
    description: "Añade Meraki a la pantalla de inicio para encontrar los eventos con un toque.",
    install: "Instalar Meraki", installing: "Instalando…", help: "Cómo añadir Meraki",
    iosSafari: "En Safari, toca Compartir y después Añadir a pantalla de inicio. Confirma con Añadir.",
    iosOther: "Abre esta página en Safari, toca Compartir y después Añadir a pantalla de inicio. Confirma con Añadir.",
    android: "Abre el menú del navegador y elige Instalar aplicación o Añadir a pantalla de inicio. Si no aparece la opción, abre esta página en Chrome.",
    desktop: "Puedes instalar Meraki desde el menú del navegador cuando la opción esté disponible.",
    dismissed: "Puedes añadir Meraki más adelante desde el menú del navegador.",
    unavailable: "Sigue las instrucciones de abajo para añadir Meraki a la pantalla de inicio.",
    connection: "Para comprar y actualizar las entradas necesitas conexión a Internet. Puedes guardar el QR en el teléfono para mostrarlo en la entrada.",
  },
};

export function InstallCard({ locale }: { locale: string }) {
  const platform = useSyncExternalStore(subscribePlatform, getPlatform, getServerPlatform);
  const { canPrompt, installed, installing, install } = useInstall();
  const [feedback, setFeedback] = useState<"dismissed" | "unavailable" | null>(null);
  const titleId = useId();
  const text = copy[locale as keyof typeof copy] ?? copy.it;

  if (platform === "server" || platform === "standalone" || installed) return null;
  if (platform === "other" && !canPrompt && !installing && !feedback) return null;

  const instructions = platform === "ios-safari" ? text.iosSafari
    : platform === "ios-other" ? text.iosOther
      : platform === "android" ? text.android : text.desktop;

  async function handleInstall() {
    const result = await install();
    if (result !== "accepted") setFeedback(result);
  }

  return (
    <section aria-labelledby={titleId} className="mb-10 rounded-3xl border border-border bg-secondary/40 p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-bold tracking-tight">{text.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text.description}</p>
          {canPrompt || installing ? (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-60"
            >
              <Download className="size-4" aria-hidden="true" />
              {installing ? text.installing : text.install}
            </button>
          ) : null}
          <p role="status" className="text-sm leading-relaxed text-muted-foreground">
            {feedback ? text[feedback] : null}
          </p>
          <details className="mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {text.help}
            </summary>
            <p className="max-w-2xl pb-2 leading-relaxed text-muted-foreground">{instructions}</p>
          </details>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text.connection}</p>
        </div>
      </div>
    </section>
  );
}
