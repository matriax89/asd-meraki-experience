import { getLocalizedText } from "@/lib/i18n-utils";
import type { Database } from "@/types/supabase";
import type { MerakiEvent } from "./event-model";

export const eventFeedColumns = "id, slug, tipo, titolo, sottotitolo, data_inizio, data_fine, copertina_url, location, indirizzo, prezzo_cents, capacity, posti_venduti";

type EventRow = Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "slug" | "tipo" | "titolo" | "sottotitolo" | "data_inizio" | "data_fine" | "copertina_url" | "location" | "indirizzo" | "prezzo_cents" | "capacity" | "posti_venduti">;

// Translate JSON on the server, so the app only receives the copy it displays.
export function toMerakiEvent(event: EventRow, locale: string): MerakiEvent {
  return {
    id: event.id,
    slug: event.slug,
    type: event.tipo,
    title: getLocalizedText(event.titolo, locale),
    subtitle: getLocalizedText(event.sottotitolo, locale),
    startsAt: event.data_inizio,
    endsAt: event.data_fine,
    cover: event.copertina_url,
    location: event.location,
    address: event.indirizzo,
    price: event.prezzo_cents,
    capacity: event.capacity,
    sold: event.posti_venduti || 0,
  };
}

// A single request-time snapshot keeps server HTML and client hydration in sync.
export function eventFeedSnapshot(events: EventRow[], locale: string) {
  return { events: events.map((event) => toMerakiEvent(event, locale)), now: Date.now() };
}
