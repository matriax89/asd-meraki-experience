import { getTranslations } from "next-intl/server";
import { EventFeed } from "@/components/meraki/event-feed";
import { enrichCommerceFeed } from "@/lib/commerce/feed";
import { getPublishedEventFeed } from "@/lib/events/public-feed";
import { getFeaturedSocialEvent } from "@/lib/events/social-data";
import { brandSocialMetadata, eventSocialMetadata } from "@/lib/events/social-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [t, event] = await Promise.all([
    getTranslations({ locale, namespace: "EventsPage" }), getFeaturedSocialEvent(),
  ]);
  return event ? eventSocialMetadata(event, locale, "/eventi") : brandSocialMetadata(locale, "/eventi", { title: `${t("title")} · Meraki` });
}

export default async function EventiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const snapshot = await getPublishedEventFeed(locale);
  const events = await enrichCommerceFeed(snapshot.events);
  return <EventFeed events={events} locale={locale} now={snapshot.now} loadError={snapshot.loadError} />;
}
