import { getLocale } from "next-intl/server";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { AdminTicket, CheckInEntitlement } from "@/lib/tickets/check-in-types";
import { TicketsClient } from "./tickets-client";

type EventRow = { id: string; titolo: unknown; data_inizio: string };
type LegacyCheckInTicket = Omit<AdminTicket, "events"> & { events: EventRow | EventRow[] | null };
type CommerceCheckInPass = {
  id: string; event_id: string; first_name: string; last_name: string; package_name: string; qr_code: string; status: "paid" | "refunded" | "canceled";
  events: EventRow | null;
  commerce_orders: { buyer_email: string } | null;
  commerce_entitlements: CheckInEntitlement[];
};
type AttendeeEmail = { pass_id: string; email: string; created_at: string };

// Supabase caps a single response. Walk stable pages so the event's counts and
// searchable participant list include every issued ticket, not only the first 1,000.
async function loadRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) return { data: [] as T[], error };
    rows.push(...(data || []) as T[]);
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

export default async function AdminBigliettiPage({ searchParams }: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  let admin;
  try { admin = await requireCommerceStaff(); } catch { return <div role="alert">Accedi con un account autorizzato per gestire i biglietti.</div>; }
  const [locale, query, eventResult] = await Promise.all([
    getLocale(), searchParams,
    loadRows<EventRow>((from, to) => admin.from("events").select("id,titolo,data_inizio").order("data_inizio", { ascending: false }).order("id").range(from, to)),
  ]);
  if (eventResult.error) return <div role="alert">Errore durante il caricamento degli eventi. Ricarica la pagina.</div>;
  const initialEventId = typeof query.event === "string" && eventResult.data.some((event) => event.id === query.event) ? query.event : "";
  const events = eventResult.data.map((event) => ({ ...event, titolo: getLocalizedText(event.titolo, locale), activities: [] as { id: string; name: string }[] }));
  if (!initialEventId) return <TicketsClient initialTickets={[]} events={events} initialEventId="" />;

  const [ticketResult, configResult, commerceResult] = await Promise.all([
    loadRows<LegacyCheckInTicket>((from, to) => admin.from("tickets").select("id,event_id,buyer_nome,buyer_cognome,buyer_email,qr_code,status,used_at,events(titolo,data_inizio)").eq("event_id", initialEventId).order("created_at", { ascending: false }).order("id").range(from, to)),
    admin.from("events").select("commerce_config").eq("id", initialEventId).single(),
    loadRows<CommerceCheckInPass>((from, to) => admin.from("commerce_passes").select("id,event_id,first_name,last_name,package_name,qr_code,status,events(titolo,data_inizio),commerce_orders:commerce_orders!commerce_passes_order_id_fkey(buyer_email),commerce_entitlements(activity_id,activity_name,status,checked_in_at,menu_choice)").eq("event_id", initialEventId).order("created_at", { ascending: false }).order("id").range(from, to)),
  ]);
  if (ticketResult.error) return <div role="alert">Errore durante il caricamento dei biglietti. Ricarica la pagina.</div>;
  const selectedEvent = events.find((event) => event.id === initialEventId)!;
  selectedEvent.activities = parseCommerceConfig(configResult.data?.commerce_config)?.activities.map((activity) => ({ id: activity.id, name: activity.name })) || [];
  const tickets: AdminTicket[] = ticketResult.data.map((ticket) => {
    const event = Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
    return { ...ticket, events: event ? { ...event, titolo: getLocalizedText(event.titolo, locale) } : null };
  });

  // Group purchases can have a different recipient for every participant.
  // Read only the email fields, in bounded batches of passes from this event.
  const contactBatches = [];
  for (let index = 0; index < commerceResult.data.length; index += 100) {
    const ids = commerceResult.data.slice(index, index + 100).map((pass) => pass.id);
    contactBatches.push(loadRows<AttendeeEmail>((from, to) => admin.from("commerce_attendee_contacts").select("pass_id,email,created_at").in("pass_id", ids).order("created_at", { ascending: false }).order("id").range(from, to)));
  }
  const contactResults = await Promise.all(contactBatches);
  const participantEmails = new Map<string, string>();
  for (const result of contactResults) for (const contact of result.data) {
    if (!participantEmails.has(contact.pass_id)) participantEmails.set(contact.pass_id, contact.email);
  }
  for (const pass of commerceResult.data) {
    const entitlements = pass.commerce_entitlements || [];
    tickets.push({ id: pass.id, event_id: pass.event_id, buyer_nome: pass.first_name, buyer_cognome: pass.last_name, buyer_email: participantEmails.get(pass.id) || pass.commerce_orders?.buyer_email || "", qr_code: pass.qr_code, package_name: pass.package_name, status: pass.status !== "paid" ? "refunded" : entitlements.length > 0 && entitlements.every((entry) => entry.status === "used") ? "used" : "paid", used_at: null, commerce: true, entitlements, events: pass.events ? { ...pass.events, titolo: getLocalizedText(pass.events.titolo, locale) } : null });
  }
  return <div className="space-y-5">
    {(commerceResult.error || configResult.error) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">I biglietti avanzati non sono disponibili. Verifica la migrazione commerce prima di controllare workshop, masterclass o cena. I biglietti precedenti restano utilizzabili.</p>}
    {contactResults.some((result) => result.error) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Le email dei partecipanti non sono disponibili. Per questi biglietti viene mostrata l’email dell’acquirente.</p>}
    <TicketsClient initialTickets={tickets} events={events} initialEventId={initialEventId} />
  </div>;
}
