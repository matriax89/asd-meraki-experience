import { createClient } from "@/lib/supabase/server";
import { TicketsClient } from "./tickets-client";
import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { normalizeRegistrationFields } from "@/lib/events/registration-fields";

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
      short_code,
      status, 
      used_at,
      amount_cents,
      stripe_payment_intent,
      registration_answers,
      events (
        titolo,
        data_inizio,
        registration_fields
      )
    `).order('created_at', { ascending: false }),
    supabase.from("events").select("id, titolo, data_inizio, capacity, attivo, logo_url"),
    supabase.from("site_settings").select("value").eq("key", "homepage_content").single(),
  ]);

  if (error) {
    console.error("Error fetching tickets:", error);
    return <div>Errore durante il caricamento dei biglietti.</div>;
  }

  // Supabase returns foreign tables as arrays or single objects depending on relationship.
  // Assuming it returns an object here because it's a many-to-one relationship.
  const formattedTickets = (tickets || []).map(t => {
    const event = Array.isArray(t.events) ? t.events[0] : t.events;
    const answers = (t.registration_answers && typeof t.registration_answers === "object" && !Array.isArray(t.registration_answers))
      ? t.registration_answers as Record<string, string | boolean>
      : {};
    return {
      ...t,
      custom_answers: normalizeRegistrationFields((event as any)?.registration_fields)
        .map((field) => ({ label: field.label, value: answers[field.id] }))
        .filter((answer) => answer.value !== "" && answer.value !== undefined && answer.value !== false),
      events: event ? { ...event, titolo: getLocalizedText(event.titolo, locale) } : event,
    };
  });

  const now = Date.now();
  const scannerEvents = (events || [])
    .map(event => ({
      ...event,
      titolo: getLocalizedText(event.titolo, locale),
    }))
    .sort((a, b) => {
      const aTime = Date.parse(a.data_inizio);
      const bTime = Date.parse(b.data_inizio);
      const aUpcoming = aTime >= now;
      const bUpcoming = bTime >= now;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aUpcoming ? aTime - bTime : bTime - aTime;
    });
  const logoUrl = (settings?.value as any)?.branding?.logo_url;

  return <TicketsClient initialTickets={formattedTickets as any} scannerEvents={scannerEvents} logoUrl={logoUrl} />;
}
