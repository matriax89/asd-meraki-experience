import { createClient } from "@/lib/supabase/server";
import { TicketsClient } from "./tickets-client";

export default async function AdminBigliettiPage() {
  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select(`
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
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching tickets:", error);
    return <div>Errore durante il caricamento dei biglietti.</div>;
  }

  // Supabase returns foreign tables as arrays or single objects depending on relationship.
  // Assuming it returns an object here because it's a many-to-one relationship.
  const formattedTickets = (tickets || []).map(t => ({
    ...t,
    events: Array.isArray(t.events) ? t.events[0] : t.events
  }));

  return <TicketsClient initialTickets={formattedTickets as any} />;
}
