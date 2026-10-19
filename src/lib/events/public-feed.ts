import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { eventFeedColumns, eventFeedSnapshot } from "@/components/meraki/events-data";
import { isPastEvent } from "@/components/meraki/event-model";

// Layout and page share one request-time catalogue and clock. Commerce prices
// are enriched only by the page that actually displays the event feed.
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
