import { createClient } from "@/lib/supabase/server";
import { TicketsClient } from "./tickets-client";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";

export default async function AdminBigliettiPage() {
  const locale = await getLocale();
  const supabase = await createClient();

  const [{ data: tickets, error }, { data: events }, { data: settings }] = await Promise.all([
    supabase.from('tickets').select(`
      id, 
      event_id, 
      buyer_nome, 
      buyer_cognome, 
      buyer_email, 
      qr_code, 
      status, 
      used_at,
      events (
        titolo,
        data_inizio
      )
    `).order('created_at', { ascending: false }),
    supabase.from("events").select("id, titolo, data_inizio, capacity, attivo").order("data_inizio", { ascending: false }),
    supabase.from("site_settings").select("value").eq("key", "homepage_content").single(),
  ]);

  if (error) {
    console.error("Error fetching tickets:", error);
    return <div>Errore durante il caricamento dei biglietti.</div>;
  }

  // Supabase returns foreign tables as arrays or single objects depending on relationship.
  // Assuming it returns an object here because it's a many-to-one relationship.
  const formattedTickets = (tickets || []).map(t => ({
    ...t,
    events: (() => {
      const event = Array.isArray(t.events) ? t.events[0] : t.events;
      return event ? { ...event, titolo: getLocalizedText(event.titolo, locale) } : event;
    })()
  }));

  const scannerEvents = (events || []).map(event => ({
    ...event,
    titolo: getLocalizedText(event.titolo, locale),
  }));
  const logoUrl = (settings?.value as any)?.branding?.logo_url;

  return <TicketsClient initialTickets={formattedTickets as any} scannerEvents={scannerEvents} logoUrl={logoUrl} />;
}
