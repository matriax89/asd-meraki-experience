import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckoutButton } from "./checkout-button";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string, locale: string }> }): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const { data: evento } = await supabase
    .from("events")
    .select("titolo, descrizione, copertina_url")
    .eq("slug", slug)
    .single();

  if (!evento) {
    return { title: "Evento non trovato" };
  }

  const title = getLocalizedText(evento.titolo, locale);
  const description = getLocalizedText(evento.descrizione, locale) || title;
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
    .single();

  if (!evento) {
    notFound();
  }

  const date = new Date(evento.data_inizio);
  const formattedDate = format(date, "d MMMM yyyy", { locale: it });
  const formattedTime = format(date, "HH:mm");
  
  const postiDisponibili = evento.capacity ? evento.capacity - (evento.posti_venduti || 0) : null;
  const isEsaurito = postiDisponibili !== null && postiDisponibili <= 0;

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
              Evento
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
            {getLocalizedText(evento.descrizione, locale).split("\n").map((par, i) => (
              <p key={i}>{par}</p>
            ))}
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 sticky top-24">
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Data e Ora</span>
                <span className="text-foreground">{formattedDate} alle {formattedTime}</span>
              </div>
              
              {(evento.location || evento.indirizzo) && (
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Location</span>
                  {evento.location && <span className="text-foreground">{evento.location}</span>}
                  {evento.indirizzo && <span className="text-sm text-muted-foreground">{evento.indirizzo}</span>}
                </div>
              )}
              
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Prezzo</span>
                <span className="text-2xl font-bold text-foreground">
                  {evento.prezzo_cents ? `€${(evento.prezzo_cents / 100).toFixed(2)}` : "Gratis"}
                </span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              {isEsaurito ? (
                <button disabled className="w-full bg-muted text-muted-foreground font-bold py-3 px-4 rounded-lg cursor-not-allowed">
                  Posti Esauriti
                </button>
              ) : (
                <CheckoutButton eventId={evento.id} />
              )}
              
              {postiDisponibili !== null && !isEsaurito && (
                <p className="text-sm text-center text-muted-foreground mt-3">
                  Solo <strong className="text-foreground">{postiDisponibili}</strong> posti rimanenti
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
