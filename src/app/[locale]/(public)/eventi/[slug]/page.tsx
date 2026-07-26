import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckoutButton } from "./checkout-button";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string, locale: string }> }): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const { data: evento } = await supabase
    .from("events")
    .select("titolo, descrizione, copertina_url, meta_title, meta_description")
    .eq("slug", slug)
    .eq("attivo", true)
    .single();

  if (!evento) {
    return { title: "Evento non trovato" };
  }

  const title = typeof evento.meta_title === "string" && evento.meta_title
    ? evento.meta_title
    : getLocalizedText(evento.titolo, locale);
  const description = typeof evento.meta_description === "string" && evento.meta_description
    ? evento.meta_description
    : getLocalizedText(evento.descrizione, locale) || title;
  const image = evento.copertina_url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image && {
        images: [
          {
            url: image,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      }),
    },
  };
}

export default async function EventoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const supabase = await createClient();
  
  const { data: evento } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("tipo", "evento")
    .eq("attivo", true)
    .single();

  if (!evento) {
    notFound();
  }

  const date = new Date(evento.data_inizio);
  const formattedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Rome" }).format(date);
  const formattedTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(date);
  const copy = {
    it: { badge: "Evento", date: "Data e ora", place: "Luogo", price: "Prezzo", soldOut: "Posti esauriti", ended: "Evento concluso", remaining: "posti rimanenti", at: "alle" },
    en: { badge: "Event", date: "Date and time", place: "Venue", price: "Price", soldOut: "Sold out", ended: "Event ended", remaining: "places remaining", at: "at" },
    de: { badge: "Event", date: "Datum und Uhrzeit", place: "Ort", price: "Preis", soldOut: "Ausverkauft", ended: "Veranstaltung beendet", remaining: "Plätze verfügbar", at: "um" },
  }[locale as "it" | "en" | "de"] || { badge: "Evento", date: "Data e ora", place: "Luogo", price: "Prezzo", soldOut: "Posti esauriti", ended: "Evento concluso", remaining: "posti rimanenti", at: "alle" };
  
  const postiDisponibili = evento.capacity ? evento.capacity - (evento.posti_venduti || 0) : null;
  const isEsaurito = postiDisponibili !== null && postiDisponibili <= 0;
  const isEnded = new Date(evento.data_fine || evento.data_inizio).getTime() < Date.now();
  const mapAddress = [evento.location, evento.indirizzo].filter(Boolean).join(", ");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapAddress)}`;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapAddress)}&output=embed`;

  return (
    <div className="container py-12 md:py-24 max-w-4xl">
      {evento.copertina_url && (
        <div className="aspect-[21/9] bg-muted rounded-xl overflow-hidden mb-12 relative">
          <img src={evento.copertina_url} alt={getLocalizedText(evento.titolo, locale)} className="object-cover w-full h-full" />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-8">
          <div>
            <div className="inline-block bg-primary text-primary-foreground text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              {copy.badge}
            </div>
            <h1 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4">
              {getLocalizedText(evento.titolo, locale)}
            </h1>
            {evento.sottotitolo && (
              <p className="text-xl text-muted-foreground">
                {getLocalizedText(evento.sottotitolo, locale)}
              </p>
            )}
          </div>
          
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {(getLocalizedText(evento.descrizione, locale) || "").split("\n").map((par, i) => (
              <p key={i}>{par}</p>
            ))}
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 sticky top-24">
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{copy.date}</span>
                <span className="text-foreground">{formattedDate} {copy.at} {formattedTime}</span>
              </div>
              
              {(evento.location || evento.indirizzo) && (
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{copy.place}</span>
                  {evento.location && <span className="text-foreground">{evento.location}</span>}
                  {evento.indirizzo && <span className="text-sm text-muted-foreground">{evento.indirizzo}</span>}
                </div>
              )}
              
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{copy.price}</span>
                <span className="text-2xl font-bold text-foreground">
                  {evento.prezzo_cents ? `€${(evento.prezzo_cents / 100).toFixed(2)}` : "Gratis"}
                </span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              {isEnded ? (
                <button disabled className="w-full bg-muted text-muted-foreground font-bold py-3 px-4 rounded-lg cursor-not-allowed">
                  {copy.ended}
                </button>
              ) : isEsaurito ? (
                <button disabled className="w-full bg-muted text-muted-foreground font-bold py-3 px-4 rounded-lg cursor-not-allowed">
                  {copy.soldOut}
                </button>
              ) : evento.cta_tipo === "external_url" && evento.cta_url ? (
                <a href={evento.cta_url} target="_blank" rel="noopener noreferrer" className="block w-full rounded-lg bg-primary px-4 py-3 text-center font-bold text-primary-foreground">
                  {locale === "de" ? "Extern anmelden" : locale === "en" ? "Register externally" : "Iscriviti sul sito esterno"}
                </a>
              ) : evento.cta_tipo === "info_only" ? (
                <a href={`/${locale}/contatti`} className="block w-full rounded-lg bg-primary px-4 py-3 text-center font-bold text-primary-foreground">
                  {locale === "de" ? "Informationen anfordern" : locale === "en" ? "Request information" : "Richiedi informazioni"}
                </a>
              ) : (
                <CheckoutButton eventId={evento.id} isFree={(evento.prezzo_cents || 0) === 0} />
              )}
              
              {postiDisponibili !== null && !isEsaurito && (
                <p className="text-sm text-center text-muted-foreground mt-3">
                  <strong className="text-foreground">{postiDisponibili}</strong> {copy.remaining}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {mapAddress && (
        <section className="mt-14 overflow-hidden rounded-2xl border border-border bg-card">
          <iframe
            title={`Mappa ${mapAddress}`}
            src={embedUrl}
            className="h-72 w-full border-0 sm:h-96"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{evento.location || copy.place}</p>
              <p className="text-sm text-muted-foreground">{evento.indirizzo}</p>
            </div>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white">
              {locale === "de" ? "Route starten" : locale === "en" ? "Get directions" : "Ottieni indicazioni"}
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
