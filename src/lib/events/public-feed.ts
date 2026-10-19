import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { eventFeedColumns, eventFeedSnapshot } from "@/components/meraki/events-data";
import { isPastEvent } from "@/components/meraki/event-model";

// Reuse one request-time catalogue and clock wherever a page needs the feed.
// Commerce prices are enriched only by the page that displays the events.
export const getPublishedEventFeed = cache(async (locale: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(eventFeedColumns)
    .eq("attivo", true)
    .order("data_inizio", { ascending: true });
  const snapshot = eventFeedSnapshot(data || [], locale);

  return {
    ...snapshot,
    loadError: Boolean(error),
    hasUpcoming: !error && snapshot.events.some((event) => !isPastEvent(event, snapshot.now)),
  };
});
