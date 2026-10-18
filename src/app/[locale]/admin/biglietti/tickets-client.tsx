"use client";

import { useCallback, useRef, useState } from "react";
import { Search, Ticket, Users } from "lucide-react";
import { checkInTicket } from "@/app/api/admin/biglietti/actions";
import { DataTable } from "@/components/admin/data-table";
import type { AdminTicket, CheckInEvent, CheckInResult, CheckInTicketSummary } from "@/lib/tickets/check-in-types";
import { QrScanner } from "./qr-scanner";

export function TicketsClient({ initialTickets, events }: { initialTickets: AdminTicket[]; events: CheckInEvent[] }) {
  const [updates, setUpdates] = useState<Record<string, CheckInTicketSummary>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CheckInResult | null>(null);
  const [search, setSearch] = useState("");
  const [activityChoices, setActivityChoices] = useState<Record<string, string>>({});
  const requestPendingRef = useRef(false);
  const tickets = initialTickets.map((ticket) => ({ ...ticket, ...updates[ticket.id] }));
  const matchingTickets = tickets.filter((ticket) => [ticket.buyer_nome, ticket.buyer_cognome, ticket.buyer_email, ticket.qr_code, ticket.events?.titolo]
    .some((value) => value?.toLocaleLowerCase("it-IT").includes(search.toLocaleLowerCase("it-IT").trim())));
  const admittedCount = tickets.reduce((count, ticket) => count + (ticket.commerce ? (ticket.entitlements || []).filter((entry) => entry.status === "used").length : ticket.status === "used" ? 1 : 0), 0);

  const updateFromResult = useCallback((result: CheckInResult) => {
    if (result.ticket) {
      const ticket = result.ticket;
      setUpdates((current) => ({ ...current, [ticket.id]: ticket }));
    }
  }, []);

  const handleCheckIn = async (ticket: AdminTicket) => {
    if (requestPendingRef.current || !ticket.event_id) return;
    requestPendingRef.current = true;
    setPendingId(ticket.id);
    setFeedback(null);
    try {
      const result = await checkInTicket(ticket.id, ticket.event_id, ticket.commerce ? activityChoices[ticket.event_id] : undefined);
      updateFromResult(result);
      setFeedback(result);
    } catch {
      setFeedback({ outcome: "error", message: "Connessione interrotta. Il check-in non è confermato: riprova." });
    } finally {
      requestPendingRef.current = false;
      setPendingId(null);
    }
  };

  const columns = [
    {
      header: "Partecipante",
      cell: (ticket: AdminTicket) => <div><span className="block font-bold text-slate-900">{[ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ") || "Partecipante"}</span><span className="mt-0.5 block text-[13px] text-slate-500">{ticket.buyer_email}</span></div>,
    },
    {
      header: "Evento",
      cell: (ticket: AdminTicket) => <div><span className="block font-bold text-slate-900">{ticket.events?.titolo || "Evento non disponibile"}</span><span className="mt-0.5 block text-[13px] text-slate-500">{ticket.events?.data_inizio ? new Date(ticket.events.data_inizio).toLocaleDateString("it-IT") : ""}</span>{ticket.package_name && <span className="mt-1 block text-xs font-semibold text-indigo-600">{ticket.package_name}</span>}</div>,
    },
    {
      header: "Codice biglietto",
      cell: (ticket: AdminTicket) => <span className="block max-w-48 break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">{ticket.qr_code || "—"}</span>,
    },
    {
      header: "Stato",
      cell: (ticket: AdminTicket) => {
        const styles = ticket.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ticket.status === "refunded" ? "border-rose-200 bg-rose-50 text-rose-700" : ticket.status === "used" ? "border-slate-200 bg-slate-100 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
        const labels = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato" };
        return <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${styles}`}>{ticket.status ? labels[ticket.status] : "Da verificare"}</span>;
      },
    },
    {
      header: "Accessi compresi",
      cell: (ticket: AdminTicket) => ticket.commerce ? <ul className="min-w-40 space-y-2">{(ticket.entitlements || []).map((entry) => <li key={entry.activity_id} className={`text-xs ${entry.status === "used" ? "text-slate-500" : entry.status === "valid" ? "text-emerald-700" : "text-rose-700"}`}><span className="font-semibold">{entry.activity_name}</span><span className="block">{entry.status === "used" ? "Ingresso utilizzato" : entry.status === "valid" ? "Disponibile" : "Revocato"}{entry.menu_choice ? ` · ${entry.menu_choice}` : ""}</span></li>)}</ul> : <span className="text-xs text-slate-500">Ingresso evento</span>,
    },
    {
      header: "Ingresso",
      cell: (ticket: AdminTicket) => ticket.commerce && ticket.status === "paid" && ticket.event_id ? <div className="min-w-44 space-y-2"><select aria-label={`Attività per ${[ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ")}`} value={activityChoices[ticket.event_id] || ""} disabled={pendingId !== null} onChange={(event) => setActivityChoices((current) => ({ ...current, [ticket.event_id!]: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-xs"><option value="">Seleziona attività</option>{events.find((event) => event.id === ticket.event_id)?.activities?.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null || !activityChoices[ticket.event_id] || !ticket.entitlements?.some((entry) => entry.activity_id === activityChoices[ticket.event_id!] && entry.status === "valid")} className="min-h-11 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra attività"}</button></div> : ticket.status === "paid" && ticket.event_id ? <button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null} className="min-h-11 whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra ingresso"}</button>
        : ticket.status === "used" ? <span className="whitespace-nowrap text-xs text-slate-500">{ticket.used_at ? new Date(ticket.used_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "Ingresso registrato"}</span>
          : <span className="text-xs text-slate-400">Non disponibile</span>,
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-indigo-600">Meraki · Controllo accessi</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Biglietti e check-in</h1><p className="mt-2 text-sm leading-6 text-slate-500">Controlla i biglietti degli eventi e conferma ogni ingresso una sola volta.</p></div>
        <div className="flex gap-4 text-sm text-slate-600"><span className="flex items-center gap-1.5"><Ticket className="h-4 w-4" /> {tickets.length} biglietti</span><span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {admittedCount} ingressi</span></div>
      </div>
      <QrScanner events={events} onChecked={updateFromResult} />
      <section aria-labelledby="tickets-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="tickets-title" className="text-xl font-bold text-slate-900">Elenco biglietti</h2><div className="relative w-full sm:w-80"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input aria-label="Cerca partecipante, evento o codice" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca partecipante, evento o codice" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm" /></div></div>
        {feedback && <p role="status" className={`rounded-xl border p-4 text-sm ${feedback.outcome === "admitted" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{feedback.message}</p>}
        <DataTable data={matchingTickets} columns={columns} keyExtractor={(ticket) => ticket.id} />
      </section>
    </div>
  );
}
