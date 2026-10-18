import { getLocale } from "next-intl/server";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { AdminTicket, CheckInEntitlement } from "@/lib/tickets/check-in-types";
import { TicketsClient } from "./tickets-client";

type CommerceCheckInPass = {
  id: string; event_id: string; first_name: string; last_name: string; package_name: string; qr_code: string; status: "paid" | "refunded" | "canceled";
  events: { titolo: unknown; data_inizio: string } | null;
  commerce_orders: { buyer_email: string } | null;
  commerce_entitlements: CheckInEntitlement[];
};

export default async function AdminBigliettiPage() {
  let admin;
  try { admin = await requireCommerceStaff(); } catch { return <div role="alert">Accedi con un account autorizzato per gestire i biglietti.</div>; }
  const locale = await getLocale();
  const [ticketResult, eventResult, configResult, commerceResult] = await Promise.all([
    admin.from("tickets").select("id,event_id,buyer_nome,buyer_cognome,buyer_email,qr_code,status,used_at,events(titolo,data_inizio)").order("created_at", { ascending: false }),
    admin.from("events").select("id,titolo,data_inizio").order("data_inizio", { ascending: false }),
    admin.from("events").select("id,commerce_config"),
    admin.from("commerce_passes").select("id,event_id,first_name,last_name,package_name,qr_code,status,events(titolo,data_inizio),commerce_orders(buyer_email),commerce_entitlements(activity_id,activity_name,status,checked_in_at,menu_choice)").order("created_at", { ascending: false }),
  ]);
  if (ticketResult.error || eventResult.error) return <div role="alert">Errore durante il caricamento dei biglietti. Ricarica la pagina.</div>;
  const tickets: AdminTicket[] = (ticketResult.data || []).map((ticket) => {
    const event = Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
    return { ...ticket, events: event ? { ...event, titolo: getLocalizedText(event.titolo, locale) } : null } as AdminTicket;
  });
  const commercePasses = (commerceResult.data || []) as unknown as CommerceCheckInPass[];
  for (const pass of commercePasses) {
    const entitlements = pass.commerce_entitlements || [];
    tickets.push({ id: pass.id, event_id: pass.event_id, buyer_nome: pass.first_name, buyer_cognome: pass.last_name, buyer_email: pass.commerce_orders?.buyer_email || "", qr_code: pass.qr_code, package_name: pass.package_name, status: pass.status !== "paid" ? "refunded" : entitlements.length > 0 && entitlements.every((entry) => entry.status === "used") ? "used" : "paid", used_at: null, commerce: true, entitlements, events: pass.events ? { ...pass.events, titolo: getLocalizedText(pass.events.titolo, locale) } : null });
  }
  const events = (eventResult.data || []).map((event) => ({ ...event, titolo: getLocalizedText(event.titolo, locale), activities: parseCommerceConfig(configResult.data?.find((row) => row.id === event.id)?.commerce_config)?.activities.map((activity) => ({ id: activity.id, name: activity.name })) || [] }));
  return <div className="space-y-5">{(commerceResult.error || configResult.error) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">I biglietti avanzati non sono disponibili. Verifica la migrazione commerce prima di controllare workshop, masterclass o cena. I biglietti precedenti restano utilizzabili.</p>}<TicketsClient initialTickets={tickets} events={events} /></div>;
}
