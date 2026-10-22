"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, Clapperboard, Play, X } from "lucide-react";
import { COOKIE_CONSENT_CHANGED_EVENT, COOKIE_CONSENT_KEY, storedMarketingConsent } from "@/lib/facebook-pixel";
import { normalizeYoutubeUrl, youtubeEmbedUrl } from "@/lib/events/youtube";
import { YoutubePlayer } from "./youtube-player";
import { NativeVideoPlayer } from "./native-video-player";
import { normalizeNativeVideoUrl } from "@/lib/events/native-video";

const labels = {
  it: { video: "Il video dell’esperienza", title: "Scopri cosa ti aspetta", watch: "Guarda il video", consent: "Il video è ospitato su YouTube. Premendo il pulsante autorizzi il caricamento solo per questa pagina.", external: "Apri su YouTube", close: "Chiudi il video" },
  en: { video: "Experience video", title: "See what awaits you", watch: "Watch the video", consent: "The video is hosted on YouTube. Pressing the button allows it to load for this page only.", external: "Open on YouTube", close: "Close the video" },
  de: { video: "Einblick im Video", title: "Entdecke, was dich erwartet", watch: "Video ansehen", consent: "Das Video wird auf YouTube gehostet. Mit der Schaltfläche erlaubst du das Laden nur für diese Seite.", external: "Auf YouTube öffnen", close: "Video schließen" },
  es: { video: "El vídeo de la experiencia", title: "Descubre lo que te espera", watch: "Ver el vídeo", consent: "El vídeo está alojado en YouTube. Al pulsar el botón permites cargarlo solo en esta página.", external: "Abrir en YouTube", close: "Cerrar el vídeo" },
};

export function EventVideo({ url, videoUrl, title, locale }: { url?: string | null; videoUrl?: string | null; title?: string; locale: string }) {
  const native = normalizeNativeVideoUrl(videoUrl);
  if (native) return <NativeEventVideo key={native} src={native} title={title} locale={locale} />;
  const canonical = normalizeYoutubeUrl(url);
  const embed = youtubeEmbedUrl(url);
  if (!canonical || !embed) return null;
  return <VideoPlayer key={canonical} canonical={canonical} embed={embed} title={title} locale={locale} />;
}

function NativeEventVideo({ src, title, locale }: { src: string; title?: string; locale: string }) {
  const text = labels[locale as keyof typeof labels] || labels.it;
  const heading = title?.trim() || text.title;
  const headingId = useId();
  const [closed, setClosed] = useState(false);
  return <section data-event-video data-video-provider="native" aria-labelledby={headingId} className="mt-6 min-w-0 rounded-[22px] border border-[#dfe2d6] bg-white p-4 sm:p-5">
    <VideoHeading headingId={headingId} heading={heading} caption={text.video} closeLabel={text.close} onClose={closed ? undefined : () => setClosed(true)} />
    {closed ? <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[16px] bg-[#18251f] p-5"><button type="button" onClick={() => setClosed(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#18251f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d9c38e]"><Play className="h-4 w-4" aria-hidden="true" />{text.watch}</button></div> : <NativeVideoPlayer src={src} title={heading} locale={locale} />}
  </section>;
}

function VideoHeading({ headingId, heading, caption, closeLabel, onClose }: { headingId: string; heading: string; caption: string; closeLabel: string; onClose?: () => void }) {
  return <div className="mb-4 flex items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1ead9] text-[#79643b]" aria-hidden="true"><Clapperboard className="h-5 w-5" /></span>
      <div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase leading-4 tracking-[.12em] text-[#79643b]">{caption}</p><h2 id={headingId} className="break-words text-base font-semibold leading-6 text-[#18251f]">{heading}</h2></div>
    </div>
    {onClose && <button type="button" aria-label={closeLabel} onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dedfd3] text-[#52604f] transition hover:bg-[#f0f0e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a58d58]"><X className="h-4 w-4" aria-hidden="true" /></button>}
  </div>;
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

  return <section data-event-video aria-labelledby={headingId} className="mt-6 min-w-0 rounded-[22px] border border-[#dfe2d6] bg-white p-4 sm:p-5">
    <VideoHeading headingId={headingId} heading={heading} caption={text.video} closeLabel={text.close} onClose={allowed ? () => { setPageAllowed(false); setClosed(true); } : undefined} />
    {allowed ? <YoutubePlayer embed={embed} title={heading} locale={locale} /> : <>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[16px] bg-[#18251f] p-5"><button type="button" onClick={() => { setClosed(false); setPageAllowed(true); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#18251f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d9c38e]"><Play className="h-4 w-4" aria-hidden="true" />{text.watch}</button></div>
      <p className="mt-2 text-xs leading-5 text-[#5f6e55]">{text.consent}</p>
    </>}
    <a href={canonical} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[#d6ddcd] bg-[#f5f7f0] px-5 py-3 text-sm font-semibold text-[#294432] transition hover:border-[#a1b493] hover:bg-[#eaf0e2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a58d58] sm:w-auto"><Play className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{text.external}</span><ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></a>
  </section>;
}
