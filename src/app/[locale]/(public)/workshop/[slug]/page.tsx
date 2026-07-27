import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckoutButton } from "../../eventi/[slug]/checkout-button";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { sanitizeRichText } from "@/lib/sanitize-rich-text";
import { EventPeople } from "@/components/events/event-people";

export default async function WorkshopDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const supabase = await createClient();
  
  const { data: evento } = await (supabase
    .from("events")
    .select("*, instructor:team_members!events_instructor_id_fkey(id,nome,cognome,ruolo,bio,foto_url), event_guests(ordine_display, member:team_members(id,nome,cognome,ruolo,bio,foto_url))") as any)
    .eq("slug", slug)
    .in("tipo", ["workshop", "masterclass"])
    .eq("attivo", true)
    .single();

  if (!evento) {
    notFound();
  }

  const date = new Date(evento.data_inizio);
  const formattedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Rome" }).format(date);
  const formattedTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(date);
  const copy = {
    it: { date: "Data e ora", place: "Luogo", price: "Prezzo", soldOut: "Posti esauriti", remaining: "posti rimanenti", at: "alle" },
    en: { date: "Date and time", place: "Venue", price: "Price", soldOut: "Sold out", remaining: "places remaining", at: "at" },
    de: { date: "Datum und Uhrzeit", place: "Ort", price: "Preis", soldOut: "Ausverkauft", remaining: "Plätze verfügbar", at: "um" },
  }[locale as "it" | "en" | "de"] || { date: "Data e ora", place: "Luogo", price: "Prezzo", soldOut: "Posti esauriti", remaining: "posti rimanenti", at: "alle" };
  
  const postiDisponibili = evento.capacity ? evento.capacity - (evento.posti_venduti || 0) : null;
  const isEsaurito = postiDisponibili !== null && postiDisponibili <= 0;

  return (
    <div className="container py-12 md:py-24 max-w-4xl">
      {evento.copertina_url && (
        <div className="relative mb-12 aspect-[21/9] overflow-hidden rounded-xl bg-muted">
          <img src={evento.copertina_url} alt={getLocalizedText(evento.titolo, locale)} className="h-full w-full object-cover" />
          {evento.logo_url && (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/25" />
              <div className="absolute inset-x-5 top-5 flex justify-center sm:inset-x-8 sm:top-8">
                <div className="rounded-xl bg-white/92 px-5 py-3 shadow-xl backdrop-blur-sm sm:px-7 sm:py-4">
                  <img src={evento.logo_url} alt={`Logo ${getLocalizedText(evento.titolo, locale)}`} className="max-h-16 max-w-52 object-contain sm:max-h-24 sm:max-w-72" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {!evento.copertina_url && evento.logo_url && (
        <div className="mb-12 flex min-h-44 items-center justify-center rounded-xl bg-slate-950 p-8">
          <img src={evento.logo_url} alt={`Logo ${getLocalizedText(evento.titolo, locale)}`} className="max-h-24 max-w-64 object-contain" />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-8">
          <div>
            <div className="inline-block bg-primary text-primary-foreground text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
              Workshop
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
          
          <div
            className="max-w-none text-base leading-8 text-slate-700 [&_a]:font-semibold [&_a]:text-indigo-600 [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-5 [&_blockquote]:italic [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-950 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-950 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(getLocalizedText(evento.descrizione, locale)) }}
          />
          <EventPeople
            instructor={evento.instructor}
            guests={(evento.event_guests || []).sort((a: any, b: any) => a.ordine_display - b.ordine_display).map((guest: any) => guest.member).filter(Boolean)}
          />
        </div>
        
        <aside className="space-y-4 md:sticky md:top-24 md:self-start">
          {evento.copertina_url && (
            <figure className="overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm">
              <img
                src={evento.copertina_url}
                alt={`Locandina ${getLocalizedText(evento.titolo, locale)}`}
                className="h-auto w-full rounded-lg object-contain"
              />
            </figure>
          )}
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
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
              {isEsaurito ? (
                <button disabled className="w-full bg-muted text-muted-foreground font-bold py-3 px-4 rounded-lg cursor-not-allowed">
                  {copy.soldOut}
                </button>
              ) : (
                <CheckoutButton eventId={evento.id} isFree={(evento.prezzo_cents || 0) === 0} registrationFields={evento.registration_fields} isTrialCampaign={Boolean((evento as any).trial_campaign_key)} />
              )}
              
              {postiDisponibili !== null && !isEsaurito && (
                <p className="text-sm text-center text-muted-foreground mt-3">
                  <strong className="text-foreground">{postiDisponibili}</strong> {copy.remaining}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
