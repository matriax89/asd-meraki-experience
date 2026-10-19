import { hasEventLogistics, parseEventLogistics } from "@/lib/events/logistics";

export const eventTravelCopy = {
  it: { action: "Organizza il viaggio", heading: "Viaggio e soggiorno", body: "Hotel, collegamenti e informazioni pratiche aggiornate per il tuo evento." },
  en: { action: "Plan your trip", heading: "Travel and accommodation", body: "Find up-to-date hotels, transport links and practical information for your event." },
  de: { action: "Reise planen", heading: "Anreise und Unterkunft", body: "Aktuelle Hotels, Verkehrsverbindungen und praktische Informationen für dein Event." },
  es: { action: "Organiza tu viaje", heading: "Viaje y alojamiento", body: "Hoteles, conexiones e información práctica actualizada para tu evento." },
};

/** Public destination only: private ticket credentials never enter travel links. */
export function eventTravelPath(event: { slug?: unknown; tipo?: unknown; logistics?: unknown; attivo?: unknown }, locale: string): string | null {
  const language = ["it", "en", "de", "es"].includes(locale) ? locale : "it";
  if (event.attivo === false || typeof event.slug !== "string" || !event.slug.trim() || event.slug.length > 160 || !hasEventLogistics(parseEventLogistics(event.logistics), language)) return null;
  const route = event.tipo === "workshop" || event.tipo === "masterclass" ? "workshop" : "eventi";
  return `/${language}/${route}/${encodeURIComponent(event.slug)}#viaggio-soggiorno`;
}
