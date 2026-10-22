"use client";

import { useEffect, useId, useState } from "react";
import { Play, X } from "lucide-react";
import { COOKIE_CONSENT_CHANGED_EVENT, COOKIE_CONSENT_KEY, storedMarketingConsent } from "@/lib/facebook-pixel";
import { normalizeYoutubeUrl, youtubeEmbedUrl } from "@/lib/events/youtube";

const labels = {
  it: { title: "Scopri cosa ti aspetta", watch: "Guarda il video", consent: "Il video è ospitato su YouTube. Premendo il pulsante autorizzi il caricamento solo per questa pagina.", playback: "Il video parte senza audio. Se non si avvia, premi Play. Puoi attivare l’audio dai controlli del video.", external: "Apri su YouTube", close: "Chiudi il video" },
  en: { title: "See what awaits you", watch: "Watch the video", consent: "The video is hosted on YouTube. Pressing the button allows it to load for this page only.", playback: "The video starts muted. If it does not start, press Play. Use the video controls to turn on the sound.", external: "Open on YouTube", close: "Close the video" },
  de: { title: "Entdecke, was dich erwartet", watch: "Video ansehen", consent: "Das Video wird auf YouTube gehostet. Mit der Schaltfläche erlaubst du das Laden nur für diese Seite.", playback: "Das Video startet ohne Ton. Falls es nicht startet, drücke auf Play. Den Ton kannst du über die Videosteuerung einschalten.", external: "Auf YouTube öffnen", close: "Video schließen" },
  es: { title: "Descubre lo que te espera", watch: "Ver el vídeo", consent: "El vídeo está alojado en YouTube. Al pulsar el botón permites cargarlo solo en esta página.", playback: "El vídeo empieza sin sonido. Si no se inicia, pulsa Play. Puedes activar el sonido desde los controles del vídeo.", external: "Abrir en YouTube", close: "Cerrar el vídeo" },
};

export function EventVideo({ url, title, locale }: { url?: string | null; title?: string; locale: string }) {
  const canonical = normalizeYoutubeUrl(url);
  const embed = youtubeEmbedUrl(url);
  if (!canonical || !embed) return null;
  return <VideoPlayer key={canonical} canonical={canonical} embed={embed} title={title} locale={locale} />;
}

function VideoPlayer({ canonical, embed, title, locale }: { canonical: string; embed: string; title?: string; locale: string }) {
  const text = labels[locale as keyof typeof labels] || labels.it;
  const heading = title?.trim() || text.title;
  const headingId = useId();
  const [cookieAllowed, setCookieAllowed] = useState(false);
  const [pageAllowed, setPageAllowed] = useState(false);
  const [closed, setClosed] = useState(false);
  const allowed = !closed && (cookieAllowed || pageAllowed);

  useEffect(() => {
    const timer = window.setTimeout(() => setCookieAllowed(storedMarketingConsent(window)), 0);
    const sync = (allowed: boolean) => {
      setCookieAllowed(allowed);
      if (!allowed) setPageAllowed(false);
    };
    const onConsent = (event: Event) => { window.clearTimeout(timer); sync((event as CustomEvent<{ marketing?: boolean }>).detail?.marketing === true); };
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === COOKIE_CONSENT_KEY) { window.clearTimeout(timer); sync(storedMarketingConsent(window)); } };
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onConsent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return <section data-event-video aria-labelledby={headingId} className="mt-6 min-w-0">
    <div className="mb-3 flex items-start justify-between gap-3"><h2 id={headingId} className="min-w-0 break-words text-base font-semibold leading-6 text-[#18251f]">{heading}</h2>{allowed && <button type="button" aria-label={text.close} onClick={() => { setPageAllowed(false); setClosed(true); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dedfd3] text-[#52604f] hover:bg-[#f0f0e8]"><X className="h-4 w-4" aria-hidden="true" /></button>}</div>
    <div className="relative aspect-video overflow-hidden rounded-[16px] bg-[#18251f]">
      {allowed ? <iframe src={embed} title={`${heading} · YouTube`} className="absolute inset-0 h-full w-full border-0" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="flex h-full items-center justify-center p-5"><button type="button" onClick={() => { setClosed(false); setPageAllowed(true); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#18251f]"><Play className="h-4 w-4" aria-hidden="true" />{text.watch}</button></div>}
    </div>
    <p className="mt-2 text-xs leading-5 text-[#727b6a]">{allowed ? text.playback : text.consent}</p>
    {allowed && <a href={canonical} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-[#52604f] underline underline-offset-4">{text.external}<span className="ml-1" aria-hidden="true">↗</span></a>}
  </section>;
}
