import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { EventDetail } from "@/components/meraki/event-detail";
import { eventFeedColumns, toMerakiEvent } from "@/components/meraki/events-data";

type PageParams = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("titolo, descrizione, copertina_url").eq("slug", slug).in("tipo", ["workshop", "masterclass"]).eq("attivo", true).single();
  if (!event) return { title: locale === "en" ? "Event not found" : locale === "de" ? "Event nicht gefunden" : "Evento non trovato" };
  const title = getLocalizedText(event.titolo, locale);
  const description = getLocalizedText(event.descrizione, locale).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || title;
  return { title, description, openGraph: { title, description, ...(event.copertina_url && { images: [{ url: event.copertina_url, width: 1200, height: 630, alt: title }] }) } };
}

export default async function DetailPage({ params }: PageParams) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(`${eventFeedColumns}, descrizione, cta_tipo, cta_url`).eq("slug", slug).in("tipo", ["workshop", "masterclass"]).eq("attivo", true).single();
  if (!event) notFound();
  return <EventDetail event={{ ...toMerakiEvent(event, locale), description: getLocalizedText(event.descrizione, locale), ctaType: event.cta_tipo, ctaUrl: event.cta_url }} locale={locale} />;
}
