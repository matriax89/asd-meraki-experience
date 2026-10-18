import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventFeed } from "@/components/meraki/event-feed";
import { eventFeedColumns, eventFeedSnapshot } from "@/components/meraki/events-data";
import { enrichCommerceFeed } from "@/lib/commerce/feed";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "EventsPage" });
  return { title: `${t("title")} · Meraki` };
}

export default async function EventiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("events").select(eventFeedColumns).eq("attivo", true).order("data_inizio", { ascending: true });
  const snapshot = eventFeedSnapshot(events || [], locale);
  snapshot.events = await enrichCommerceFeed(snapshot.events);
  return <EventFeed {...snapshot} locale={locale} loadError={Boolean(error)} />;
}
