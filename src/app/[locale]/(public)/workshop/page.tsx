import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventFeed } from "@/components/meraki/event-feed";
import { eventFeedColumns, eventFeedSnapshot } from "@/components/meraki/events-data";
import { enrichCommerceFeed } from "@/lib/commerce/feed";
import { getFeaturedSocialEvent } from "@/lib/events/social-data";
import { brandSocialMetadata, eventSocialMetadata } from "@/lib/events/social-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, event] = await Promise.all([
    getTranslations({ locale, namespace: "Index" }), getFeaturedSocialEvent(["workshop", "masterclass"]),
  ]);
  return event ? eventSocialMetadata(event, locale, "/workshop") : brandSocialMetadata(locale, "/workshop", { title: `Workshop · ${t("title")}` });
}

export default async function WorkshopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("events").select(eventFeedColumns).eq("attivo", true).order("data_inizio", { ascending: true });
  const snapshot = eventFeedSnapshot(events || [], locale);
  snapshot.events = await enrichCommerceFeed(snapshot.events);
  return <EventFeed {...snapshot} locale={locale} initialType="workshop" loadError={Boolean(error)} />;
}
