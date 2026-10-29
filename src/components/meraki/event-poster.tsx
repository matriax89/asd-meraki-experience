"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, Expand, X, ZoomIn, ZoomOut } from "lucide-react";

const copy = {
  it: { poster: "Locandina", open: "Ingrandisci locandina", hint: "Apri la locandina", close: "Chiudi locandina", zoomIn: "Ingrandisci", zoomOut: "Riduci" },
  en: { poster: "Event poster", open: "Enlarge event poster", hint: "Open the poster", close: "Close poster", zoomIn: "Zoom in", zoomOut: "Zoom out" },
  de: { poster: "Veranstaltungsplakat", open: "Plakat vergrößern", hint: "Plakat öffnen", close: "Plakat schließen", zoomIn: "Vergrößern", zoomOut: "Verkleinern" },
  es: { poster: "Cartel del evento", open: "Ampliar cartel", hint: "Abrir cartel", close: "Cerrar cartel", zoomIn: "Ampliar", zoomOut: "Reducir" },
};

export function EventPoster({ src, title, locale, eager = false, compact = false }: { src: string | null; title: string; locale: string; eager?: boolean; compact?: boolean }) {
  const text = copy[locale as keyof typeof copy] || copy.it;
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef("");
  const opened = useRef(false);
  const titleId = useId();
  const viewportId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => () => { if (opened.current) document.body.style.overflow = previousOverflow.current; }, []);
  const restore = () => {
    opened.current = false;
    setIsOpen(false);
    document.body.style.overflow = previousOverflow.current;
    trigger.current?.focus();
  };
  const show = () => {
    if (!dialog.current || dialog.current.open) return;
    setZoomed(false);
    if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0; }
    previousOverflow.current = document.body.style.overflow;
    dialog.current.showModal();
    opened.current = true;
    setIsOpen(true);
    document.body.style.overflow = "hidden";
  };
  if (!src) return <div data-event-poster className="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-[#e9eae3]"><CalendarDays aria-hidden="true" className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-[#8b967b]" /></div>;
  return <div className="min-w-0">
    <button ref={trigger} data-event-poster type="button" aria-haspopup="dialog" aria-label={`${text.open} · ${title}`} onClick={show} className="relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-[20px] bg-[#e9eae3] outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#a38a59]">
      <Image unoptimized={/^http:\/\//i.test(src)} src={src} alt={`${text.poster} · ${title}`} fill sizes={compact ? "(min-width: 640px) 112px, 96px" : "(min-width: 420px) 420px, 100vw"} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} className="object-contain" />
    </button>
    <p className={`mt-2 flex items-center justify-center gap-1.5 text-[#788170] ${compact ? "text-[9px] leading-4" : "text-[11px] leading-5"}`}><Expand aria-hidden="true" className="h-3 w-3 shrink-0" />{text.hint}</p>
    <dialog ref={dialog} aria-labelledby={titleId} onClose={restore} onCancel={(event) => { event.preventDefault(); dialog.current?.close(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-full max-w-[1120px] overflow-hidden border-0 bg-[#f5f4f0] p-0 text-[#18251f] shadow-2xl backdrop:bg-[#101c17]/80 sm:h-[94dvh] sm:max-h-[94dvh] sm:rounded-[24px]">
      <div className="flex h-full min-h-0 flex-col">
      <div className="z-10 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e2e4d9] bg-[#f5f4f0] px-4 py-2">
        <h2 id={titleId} className="min-w-0 text-sm font-semibold leading-5">{text.poster} · {title}</h2>
        <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-controls={viewportId} aria-pressed={zoomed} onClick={() => setZoomed((current) => !current)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#d8ddcd] bg-white px-3 text-xs font-semibold">{zoomed ? <ZoomOut aria-hidden="true" className="h-4 w-4" /> : <ZoomIn aria-hidden="true" className="h-4 w-4" />}{zoomed ? text.zoomOut : text.zoomIn}</button>
        <button type="button" autoFocus aria-label={text.close} onClick={() => dialog.current?.close()} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#d8ddcd] bg-white"><X aria-hidden="true" className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={viewport} id={viewportId} data-poster-viewport data-zoomed={zoomed || undefined} tabIndex={0} aria-label={`${text.poster} · ${title}`} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain p-3 outline-offset-[-4px] sm:p-5">{isOpen ? <Image unoptimized src={src} alt={`${text.poster} · ${title}`} width={1080} height={1350} sizes="(min-width: 1024px) 1080px, 100vw" className={zoomed ? "block h-auto w-[1080px] max-w-none object-contain" : "mx-auto block h-auto w-full max-w-[1080px] object-contain"} /> : null}</div>
      </div>
    </dialog>
  </div>;
}
