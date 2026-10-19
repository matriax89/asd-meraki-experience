"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, Users } from "lucide-react";
import { checkInTicket } from "@/app/api/admin/biglietti/actions";
import { DataTable } from "@/components/admin/data-table";
import type { AdminTicket, CheckInEvent, CheckInResult, CheckInTicketSummary } from "@/lib/tickets/check-in-types";
import { QrScanner } from "./qr-scanner";

function participantName(ticket: AdminTicket) {
  return [ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ") || "Partecipante";
}

function eventDate(date: string) {
  return new Date(date).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

export function TicketsClient({ initialTickets, events, initialEventId = "" }: {
  initialTickets: AdminTicket[];
  events: CheckInEvent[];
  initialEventId?: string;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const eventId = events.some((event) => event.id === initialEventId) ? initialEventId : "";
  const [updates, setUpdates] = useState<Record<string, CheckInTicketSummary>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CheckInResult | null>(null);
  const [search, setSearch] = useState("");
  const [activityChoices, setActivityChoices] = useState<Record<string, string>>({});
  const requestPendingRef = useRef(false);
  const selectedEvent = events.find((event) => event.id === eventId);
  const tickets = initialTickets.map((ticket) => ({ ...ticket, ...updates[ticket.id] })).filter((ticket) => ticket.event_id === selectedEvent?.id);
  const query = search.toLocaleLowerCase("it-IT").trim();
  const matchingTickets = tickets.filter((ticket) => [participantName(ticket), ticket.buyer_email, ticket.qr_code].join(" ").toLocaleLowerCase("it-IT").includes(query));
  const validTickets = tickets.filter((ticket) => ticket.status === "paid" || ticket.status === "used").filter((ticket) => !ticket.commerce || ticket.entitlements?.some((entry) => entry.status === "valid" || entry.status === "used"));
  const admittedCount = validTickets.filter((ticket) => ticket.commerce ? ticket.entitlements?.some((entry) => entry.status === "used") : ticket.status === "used").length;

  const updateFromResult = useCallback((result: CheckInResult) => {
    if (result.ticket) {
      const ticket = result.ticket;
      setUpdates((current) => ({ ...current, [ticket.id]: ticket }));
    }
  }, []);

  const selectEvent = (nextEventId: string) => {
    if (requestPendingRef.current || isNavigating || nextEventId === eventId) return;
    setSearch("");
    setFeedback(null);
    setUpdates({});
    setActivityChoices({});
    const url = new URL(window.location.href);
    if (nextEventId) url.searchParams.set("event", nextEventId);
    else url.searchParams.delete("event");
    startNavigation(() => router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false }));
  };

  const handleCheckIn = async (ticket: AdminTicket) => {
    if (requestPendingRef.current || !selectedEvent || ticket.event_id !== selectedEvent.id || ticket.status !== "paid") return;
    const activityId = ticket.commerce ? activityChoices[ticket.id] : undefined;
    if (ticket.commerce && !ticket.entitlements?.some((entry) => entry.activity_id === activityId && entry.status === "valid")) return;
    requestPendingRef.current = true;
    setPendingId(ticket.id);
    setFeedback(null);
    try {
      const result = await checkInTicket(ticket.id, selectedEvent.id, activityId);
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
      cell: (ticket: AdminTicket) => <div><span className="block font-bold text-slate-900">{participantName(ticket)}</span><span className="mt-0.5 block break-all text-[13px] text-slate-500">{ticket.buyer_email}</span></div>,
    },
    {
      header: "Biglietto",
      cell: (ticket: AdminTicket) => <div className="space-y-2">{ticket.package_name && <span className="block text-xs font-semibold text-indigo-600">{ticket.package_name}</span>}<span className="block max-w-48 break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">{ticket.qr_code || "—"}</span></div>,
    },
    {
      header: "Accessi compresi",
      cell: (ticket: AdminTicket) => ticket.commerce ? <ul className="min-w-40 space-y-2">{(ticket.entitlements || []).map((entry) => <li key={entry.activity_id} className={`text-xs ${entry.status === "used" ? "text-slate-500" : entry.status === "valid" ? "text-emerald-700" : "text-rose-700"}`}><span className="font-semibold">{entry.activity_name}</span><span className="block">{entry.status === "used" ? "Check-in registrato" : entry.status === "valid" ? "Da utilizzare" : "Revocato"}{entry.menu_choice ? ` · Menu: ${entry.menu_choice}` : ""}</span>{entry.checked_in_at && <span className="block">{new Date(entry.checked_in_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</span>}</li>)}</ul> : <span className="text-xs text-slate-500">Ingresso evento</span>,
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
      header: "Check-in manuale",
      cell: (ticket: AdminTicket) => ticket.commerce && ticket.status === "paid" ? <div className="min-w-44 space-y-2"><select aria-label={`Attività per ${participantName(ticket)}`} value={activityChoices[ticket.id] || ""} disabled={pendingId !== null} onChange={(event) => setActivityChoices((current) => ({ ...current, [ticket.id]: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-xs"><option value="">Seleziona attività</option>{(ticket.entitlements || []).map((entry) => <option key={entry.activity_id} value={entry.activity_id} disabled={entry.status !== "valid"}>{entry.activity_name}{entry.status === "used" ? " · già utilizzato" : entry.status !== "valid" ? " · revocato" : ""}</option>)}</select><button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null || !ticket.entitlements?.some((entry) => entry.activity_id === activityChoices[ticket.id] && entry.status === "valid")} className="min-h-11 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra attività"}</button></div> : ticket.status === "paid" ? <button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null} className="min-h-11 whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra ingresso"}</button>
        : ticket.status === "used" ? <span className="whitespace-nowrap text-xs text-slate-500">{ticket.used_at ? new Date(ticket.used_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : "Check-in completati"}</span>
          : <span className="text-xs text-slate-400">Non disponibile</span>,
    },
  ];

  return (
    <div aria-busy={isNavigating} className="min-w-0 space-y-6">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-indigo-600">Meraki · Controllo accessi</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Biglietti e check-in</h1><p className="mt-2 text-sm leading-6 text-slate-500">Seleziona l’evento, cerca il partecipante e registra l’ingresso dall’elenco o con il QR.</p></div>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
        <label htmlFor="tickets-event" className="block font-semibold text-slate-900">Evento dell’elenco iscritti</label>
        <select id="tickets-event" value={eventId} disabled={pendingId !== null || isNavigating} onChange={(event) => selectEvent(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60">
          <option value="">Seleziona un evento</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.titolo} · {eventDate(event.data_inizio)}</option>)}
        </select>
        {!events.length && <p className="text-sm text-slate-500">Carica un evento per iniziare il check-in.</p>}
      </div>
      {isNavigating ? <p role="status" className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-600">Caricamento degli iscritti… La fotocamera è spenta.</p> : selectedEvent ? <>
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-slate-900">{selectedEvent.titolo} <span className="whitespace-nowrap text-sm font-normal text-slate-500">{eventDate(selectedEvent.data_inizio)}</span></h2>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="flex items-center gap-2 text-sm text-slate-500"><Ticket aria-hidden="true" className="h-4 w-4" /> Iscritti validi</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{validTickets.length}</dd></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><dt className="flex items-center gap-2 text-sm text-emerald-800"><Users aria-hidden="true" className="h-4 w-4" /> Con check-in</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{admittedCount}</dd></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-500">Senza check-in</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{validTickets.length - admittedCount}</dd></div>
          </dl>
          <p className="text-xs leading-5 text-slate-500">Ogni biglietto valido conta una persona. “Con check-in” indica almeno un accesso registrato; pagamenti in attesa e rimborsi sono esclusi dai conteggi.</p>
        </div>
        <section aria-labelledby="tickets-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="tickets-title" className="text-xl font-bold text-slate-900">Check-in manuale · iscritti</h2><p className="mt-1 text-sm text-slate-500">Il check-in dall’elenco non richiede la fotocamera. Per le formule, scegli un’attività alla volta.</p></div><div className="relative w-full sm:w-80"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input aria-label="Cerca nome, email o codice" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome, email o codice" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm" /></div></div>
          <p role="status" className="text-sm text-slate-500">{matchingTickets.length} risultati su {tickets.length} biglietti dell’evento.</p>
          {feedback && <p role="status" className={`rounded-xl border p-4 text-sm ${feedback.outcome === "admitted" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{feedback.message}</p>}
          <DataTable data={matchingTickets} columns={columns} keyExtractor={(ticket) => ticket.id} />
        </section>
        <QrScanner key={selectedEvent.id} events={[selectedEvent]} initialEventId={selectedEvent.id} onChecked={updateFromResult} />
      </> : <p role="status" className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-600">Seleziona un evento per vedere gli iscritti e iniziare il check-in manuale o QR.</p>}
    </div>
  );
}
