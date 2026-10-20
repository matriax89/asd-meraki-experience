import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { EventDetail } from "@/components/meraki/event-detail";
import { eventFeedColumns, toMerakiEvent } from "@/components/meraki/events-data";
import { parseEventLogistics } from "@/lib/events/logistics";
import { publicEventAffiliates } from "@/lib/events/affiliates";
import { richTextPlainText } from "@/lib/rich-text";

type PageParams = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("titolo, descrizione, copertina_url").eq("slug", slug).eq("tipo", "evento").eq("attivo", true).single();
  if (!event) return { title: locale === "en" ? "Event not found" : locale === "de" ? "Veranstaltung nicht gefunden" : locale === "es" ? "Evento no encontrado" : "Evento non trovato" };
  const title = getLocalizedText(event.titolo, locale);
  const description = richTextPlainText(getLocalizedText(event.descrizione, locale)).replace(/\s+/g, " ").trim().slice(0, 180) || title;
  return { title, description, openGraph: { title, description, ...(event.copertina_url && { images: [{ url: event.copertina_url, width: 1080, height: 1350, alt: title }] }) } };
}

export default async function DetailPage({ params }: PageParams) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(`${eventFeedColumns}, check_in_starts_at, descrizione, cta_tipo, cta_url, logistics, affiliates`).eq("slug", slug).eq("tipo", "evento").eq("attivo", true).single();
  if (!event) notFound();
  return <EventDetail event={{ ...toMerakiEvent(event, locale), description: getLocalizedText(event.descrizione, locale), ctaType: event.cta_tipo, ctaUrl: event.cta_url, logistics: parseEventLogistics(event.logistics), affiliates: publicEventAffiliates(event.affiliates) }} locale={locale} />;
}
