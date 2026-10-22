import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { EventDetail } from "@/components/meraki/event-detail";
import { eventFeedColumns, toMerakiEvent } from "@/components/meraki/events-data";
import { parseEventLogistics } from "@/lib/events/logistics";
import { publicEventAffiliates } from "@/lib/events/affiliates";
import { getSocialEvent } from "@/lib/events/social-data";
import { eventSocialMetadata } from "@/lib/events/social-metadata";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { getCanceledPublicEvent } from "@/lib/events/canceled-public-event";
import { CanceledEvent } from "@/components/meraki/canceled-event";
import { eventCancellationCopy } from "@/lib/events/cancellation-copy";

type PageParams = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug, locale } = await params;
  const event = await getSocialEvent(slug, ["evento"]);
  if (!event) {
    const canceled = await getCanceledPublicEvent(slug, ["evento"]);
    if (canceled) return { title: `${eventCancellationCopy(locale).title} · ${getLocalizedText(canceled.titolo, locale)}`, robots: { index: false, follow: false } };
    return { title: locale === "en" ? "Event not found" : locale === "de" ? "Veranstaltung nicht gefunden" : locale === "es" ? "Evento no encontrado" : "Evento non trovato" };
  }
  return eventSocialMetadata(event, locale, `/eventi/${encodeURIComponent(slug)}`);
}

export default async function DetailPage({ params }: PageParams) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select(`${eventFeedColumns}, check_in_starts_at, descrizione, cta_tipo, cta_url, youtube_url, video_titolo, logistics, affiliates, commerce_config`).eq("slug", slug).eq("tipo", "evento").eq("attivo", true).single();
  if (!event) {
    const canceled = await getCanceledPublicEvent(slug, ["evento"]);
    if (canceled) return <CanceledEvent title={getLocalizedText(canceled.titolo, locale)} reason={canceled.cancellation_reason} cover={canceled.copertina_url} locale={locale} />;
    notFound();
  }
  const commerce = parseCommerceConfig(event.commerce_config);
  return <EventDetail event={{ ...toMerakiEvent(event, locale), description: getLocalizedText(event.descrizione, locale), ctaType: event.cta_tipo, ctaUrl: event.cta_url, youtubeUrl: event.youtube_url, videoTitle: getLocalizedText(event.video_titolo, locale), logistics: parseEventLogistics(event.logistics), affiliates: publicEventAffiliates(event.affiliates), activities: commerce?.enabled ? commerce.activities : undefined }} locale={locale} />;
}
