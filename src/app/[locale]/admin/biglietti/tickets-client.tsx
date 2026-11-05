"use client";

import { CustomSelect } from "@/components/ui/custom-select";
import { Link } from "@/i18n/routing";


import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, Users } from "lucide-react";
import { checkInTicket } from "@/app/api/admin/biglietti/actions";
import { DataTable } from "@/components/admin/data-table";
import { ParticipantDetailsButton } from "@/components/admin/participant-details-button";
import { TicketAffiliateEditor, type ParticipantAffiliateOption, type ParticipantAffiliateUpdate } from "@/components/admin/ticket-affiliate-editor";
import type { AdminTicket, CheckInEvent, CheckInResult, CheckInTicketSummary } from "@/lib/tickets/check-in-types";
import { EMPTY_PARTICIPANT_FILTERS, LEGACY_ACTIVITY, matchesParticipantFilters, participantCheckedIn, participantFormula, participantMenuKey, participantPaymentMethods, validParticipant, type ParticipantFilters } from "@/lib/tickets/participant-filters";
import { QrScanner } from "./qr-scanner";

function participantName(ticket: AdminTicket) {
  return [ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ") || "Partecipante";
}

function eventDate(date: string) {
  return new Date(date).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
}

export function TicketsClient({ initialTickets, events, initialEventId = "", initialAffiliateId = "", affiliateOptions = [], affiliateOptionsError }: {
  initialTickets: AdminTicket[];
  events: CheckInEvent[];
  initialEventId?: string;
  initialAffiliateId?: string;
  affiliateOptions?: ParticipantAffiliateOption[];
  affiliateOptionsError?: string;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const eventId = events.some((event) => event.id === initialEventId) ? initialEventId : "";
  const [updates, setUpdates] = useState<{ source: AdminTicket[]; values: Record<string, CheckInTicketSummary> }>({ source: initialTickets, values: {} });
  const [affiliateUpdates, setAffiliateUpdates] = useState<{ source: AdminTicket[]; values: Record<string, { affiliate_id: string | null; affiliate_name: string | null }> }>({ source: initialTickets, values: {} });
  const [affiliatePending, setAffiliatePending] = useState(false);
  const [affiliateFeedback, setAffiliateFeedback] = useState<string | null>(null);
  const [affiliateFilterSnapshot, setAffiliateFilterSnapshot] = useState<{ eventId: string; id: string; name: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CheckInResult | null>(null);
  const [search, setSearch] = useState("");
  const [filterSelection, setFilterSelection] = useState({ eventId, ...EMPTY_PARTICIPANT_FILTERS });
  const filters = filterSelection.eventId === eventId ? filterSelection : EMPTY_PARTICIPANT_FILTERS;
  const [activityChoices, setActivityChoices] = useState<Record<string, string>>({});
  const requestPendingRef = useRef(false);
  const selectedEvent = events.find((event) => event.id === eventId);
  const tickets = initialTickets.map((ticket) => ({ ...ticket, ...(updates.source === initialTickets ? updates.values[ticket.id] : undefined), ...(affiliateUpdates.source === initialTickets ? affiliateUpdates.values[`${ticket.commerce ? "commerce" : "legacy"}:${ticket.id}`] : undefined) })).filter((ticket) => ticket.event_id === selectedEvent?.id);
  const knownAffiliates = new Map((selectedEvent?.affiliates || []).map((affiliate) => [affiliate.id, { name: affiliate.name, active: affiliate.active }]));
  for (const ticket of tickets) {
    if (ticket.affiliate_id && !knownAffiliates.has(ticket.affiliate_id)) knownAffiliates.set(ticket.affiliate_id, { name: ticket.affiliate_name || "Affiliato archiviato", active: false });
  }
  if (affiliateFilterSnapshot?.eventId === eventId && affiliateFilterSnapshot.id === initialAffiliateId && !knownAffiliates.has(affiliateFilterSnapshot.id)) {
    knownAffiliates.set(affiliateFilterSnapshot.id, { name: affiliateFilterSnapshot.name, active: false });
  }
  const affiliateId = initialAffiliateId === "direct" || knownAffiliates.has(initialAffiliateId) ? initialAffiliateId : "";
  const scopedTickets = tickets.filter((ticket) => !affiliateId || (affiliateId === "direct" ? !ticket.affiliate_id : ticket.affiliate_id === affiliateId));
  const filteredTickets = scopedTickets.filter(ticket => matchesParticipantFilters(ticket, filters));
  const query = search.toLocaleLowerCase("it-IT").trim();
  const matchingTickets = filteredTickets.filter((ticket) => [participantName(ticket), ticket.buyer_email, ticket.qr_code].join(" ").toLocaleLowerCase("it-IT").includes(query));
  const validTickets = filteredTickets.filter(validParticipant);
  const activityOptions = new Map((selectedEvent?.activities || []).map(activity => [activity.id, activity.name]));
  const menuOptions = new Map<string, string>();
  const formulaOptions = [...new Set(tickets.map(participantFormula))].sort((a, b) => a.localeCompare(b, "it"));
  for (const ticket of tickets) for (const right of ticket.entitlements || []) {
    if (!activityOptions.has(right.activity_id)) activityOptions.set(right.activity_id, right.activity_name);
    if (validParticipant(ticket) && (right.status === "valid" || right.status === "used") && right.menu_choice) menuOptions.set(participantMenuKey(right.activity_id, right.menu_choice), `${right.activity_name} · ${right.menu_choice}`);
  }
  if (tickets.some(ticket => !ticket.commerce)) activityOptions.set(LEGACY_ACTIVITY, "Ingresso evento");
  const hasFilters = Boolean(filters.activity || filters.formula || filters.status || filters.checkIn || filters.payment || filters.menu);
  const filterDisabled = pendingId !== null || affiliatePending || isNavigating;
  const changeFilter = (name: keyof ParticipantFilters, value: string) => {
    if (requestPendingRef.current || affiliatePending || isNavigating) return;
    setFilterSelection({ eventId, ...filters, [name]: value });
    setFeedback(null);
  };
  const affiliateCounts = new Map<string, number>();
  let eventValidCount = 0;
  for (const ticket of tickets) {
    if (!validParticipant(ticket)) continue;
    eventValidCount += 1;
    const attribution = ticket.affiliate_id || "direct";
    affiliateCounts.set(attribution, (affiliateCounts.get(attribution) || 0) + 1);
  }
  const admittedCount = validTickets.filter(ticket => participantCheckedIn(ticket, filters.activity)).length;

  const updateFromResult = useCallback((result: CheckInResult) => {
    if (result.ticket) {
      const ticket = result.ticket;
      setUpdates(current => ({ source: initialTickets, values: { ...(current.source === initialTickets ? current.values : {}), [ticket.id]: ticket } }));
    }
  }, [initialTickets]);

  const selectEvent = (nextEventId: string) => {
    if (requestPendingRef.current || affiliatePending || isNavigating || nextEventId === eventId) return;
    setSearch("");
    setFeedback(null);
    setUpdates({ source: initialTickets, values: {} });
    setFilterSelection({ eventId: nextEventId, ...EMPTY_PARTICIPANT_FILTERS });
    setAffiliateUpdates({ source: initialTickets, values: {} });
    setAffiliateFeedback(null);
    setAffiliateFilterSnapshot(null);
    setActivityChoices({});
    const url = new URL(window.location.href);
    url.searchParams.delete("affiliate");
    if (nextEventId) url.searchParams.set("event", nextEventId);
    else url.searchParams.delete("event");
    startNavigation(() => router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false }));
  };

  const selectAffiliate = (nextAffiliateId: string) => {
    if (requestPendingRef.current || affiliatePending || isNavigating || nextAffiliateId === affiliateId) return;
    setSearch("");
    const next = knownAffiliates.get(nextAffiliateId);
    setAffiliateFilterSnapshot(next ? { eventId, id: nextAffiliateId, name: next.name } : null);
    setFeedback(null);
    const url = new URL(window.location.href);
    url.searchParams.set("event", eventId);
    if (nextAffiliateId) url.searchParams.set("affiliate", nextAffiliateId);
    else url.searchParams.delete("affiliate");
    startNavigation(() => router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false }));
  };

  const resetFilters = () => {
    if (filterDisabled) return;
    setFilterSelection({ eventId, ...EMPTY_PARTICIPANT_FILTERS });
    setSearch("");
    if (affiliateId) selectAffiliate("");
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

  const updateAffiliate = (participant: ParticipantAffiliateUpdate, name: string) => {
    if (participant.eventId !== eventId) return;
    const currentFilter = knownAffiliates.get(affiliateId);
    if (currentFilter) setAffiliateFilterSnapshot({ eventId, id: affiliateId, name: currentFilter.name });
    setAffiliateUpdates(current => ({ source: initialTickets, values: { ...(current.source === initialTickets ? current.values : {}), [`${participant.source}:${participant.id}`]: { affiliate_id: participant.affiliateId, affiliate_name: participant.affiliateName } } }));
    setAffiliateFeedback(participant.affiliateId ? `${name}: affiliato aggiornato a ${participant.affiliateName}. Conteggi e compensi aggiornati.` : `${name}: attribuzione rimossa, ora è un acquisto diretto. Conteggi e compensi aggiornati.`);
    router.refresh();
  };
  const reloadRoster = () => {
    setAffiliateUpdates({ source: initialTickets, values: {} });
    setAffiliateFeedback(null);
    router.refresh();
  };

  const columns = [
    {
      header: "Partecipante",
      cell: (ticket: AdminTicket) => <div><div className="flex items-center justify-between gap-3"><span className="block font-bold text-slate-900">{participantName(ticket)}</span><ParticipantDetailsButton eventId={eventId} participantId={ticket.id} source={ticket.commerce ? "commerce" : "legacy"} name={participantName(ticket)} /></div><span className="mt-0.5 block break-all text-[13px] text-slate-500">{ticket.buyer_email}</span></div>,
    },
    {
      header: "Biglietto",
      cell: (ticket: AdminTicket) => <div className="space-y-2">{ticket.package_name && <span className="block text-xs font-semibold text-indigo-600">{ticket.package_name}</span>}<div className="flex flex-wrap gap-1">{participantPaymentMethods(ticket).map(method => <span key={method} className="block w-fit rounded-md bg-[#f1f4eb] px-2 py-1 text-[11px] font-semibold text-[#4d6346]">{method === "cash" ? "Contanti" : method === "pos" ? "POS" : "Online"}</span>)}</div>{ticket.commerce && validParticipant(ticket) && ticket.entitlements?.some(right => right.status === "refunded" || right.status === "canceled") && <span className="block text-xs text-amber-800">Accessi parziali</span>}{ticket.commerce && (ticket.status === "paid" || ticket.status === "used") && <Link href={`/admin/biglietti/nuovo?event=${eventId}&upgradePass=${ticket.id}`} className="inline-flex min-h-9 items-center text-xs font-semibold text-[#36533e] underline">Aggiungi attività</Link>}<span className="block max-w-48 break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">{ticket.qr_code || "—"}</span></div>,
    },
    {
      header: "Affiliato",
      cell: (ticket: AdminTicket) => <TicketAffiliateEditor source={ticket.commerce ? "commerce" : "legacy"} participantId={ticket.id} eventId={eventId} participantName={participantName(ticket)} affiliateId={ticket.affiliate_id || null} affiliateName={ticket.affiliate_name || (ticket.affiliate_id ? knownAffiliates.get(ticket.affiliate_id)?.name : null) || null} options={affiliateOptions} optionsError={affiliateOptionsError} disabled={pendingId !== null || affiliatePending || isNavigating} editable={ticket.status === "paid" || ticket.status === "used"} onSaved={participant => updateAffiliate(participant, participantName(ticket))} onPendingChange={setAffiliatePending} onReload={reloadRoster} />,
    },
    {
      header: "Accessi compresi",
      cell: (ticket: AdminTicket) => ticket.commerce ? <ul className="min-w-40 space-y-2">{(ticket.entitlements || []).map((entry) => <li key={entry.activity_id} className={`text-xs ${entry.status === "used" ? "text-slate-500" : entry.status === "valid" ? "text-emerald-700" : "text-rose-700"}`}><span className="font-semibold">{entry.activity_name}</span><span className="block">{entry.status === "used" ? "Check-in registrato" : entry.status === "valid" ? "Da utilizzare" : "Revocato"}{entry.menu_choice ? ` · Menu: ${entry.menu_choice}` : ""}</span>{entry.checked_in_at && <span className="block">{new Date(entry.checked_in_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</span>}</li>)}</ul> : <span className="text-xs text-slate-500">Ingresso evento</span>,
    },
    {
      header: "Stato",
      cell: (ticket: AdminTicket) => {
        const styles = ticket.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ticket.status === "refunded" ? "border-rose-200 bg-rose-50 text-rose-700" : ticket.status === "used" ? "border-slate-200 bg-slate-100 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
        const labels = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
        return <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${styles}`}>{ticket.status ? labels[ticket.status] : "Da verificare"}</span>;
      },
    },
    {
      header: "Check-in manuale",
      cell: (ticket: AdminTicket) => ticket.commerce && ticket.status === "paid" ? <div className="min-w-44 space-y-2"><CustomSelect aria-label={`Attività per ${participantName(ticket)}`} value={activityChoices[ticket.id] || ""} disabled={pendingId !== null} onChange={(event) => setActivityChoices((current) => ({ ...current, [ticket.id]: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-xs"><option value="">Seleziona attività</option>{(ticket.entitlements || []).map((entry) => <option key={entry.activity_id} value={entry.activity_id} disabled={entry.status !== "valid"}>{entry.activity_name}{entry.status === "used" ? " · già utilizzato" : entry.status !== "valid" ? " · revocato" : ""}</option>)}</CustomSelect><button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null || !ticket.entitlements?.some((entry) => entry.activity_id === activityChoices[ticket.id] && entry.status === "valid")} className="min-h-11 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra attività"}</button></div> : ticket.status === "paid" ? <button type="button" onClick={() => void handleCheckIn(ticket)} disabled={pendingId !== null} className="min-h-11 whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{pendingId === ticket.id ? "Verifica…" : "Registra ingresso"}</button>
        : ticket.status === "used" ? <span className="whitespace-nowrap text-xs text-slate-500">{ticket.used_at ? new Date(ticket.used_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : "Check-in completati"}</span>
          : <span className="text-xs text-slate-400">Non disponibile</span>,
    },
  ];

  return (
    <div aria-busy={isNavigating} className="min-w-0 space-y-6">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-indigo-600">Meraki · Controllo accessi</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Biglietti e check-in</h1><p className="mt-2 text-sm leading-6 text-slate-500">Seleziona l’evento, cerca il partecipante e registra l’ingresso dall’elenco o con il QR.</p></div>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
        <label htmlFor="tickets-event" className="block font-semibold text-slate-900">Evento dell’elenco iscritti</label>
        <CustomSelect id="tickets-event" value={eventId} disabled={pendingId !== null || affiliatePending || isNavigating} onChange={(event) => selectEvent(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60">
          <option value="">Seleziona un evento</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.titolo} · {eventDate(event.data_inizio)}</option>)}
        </CustomSelect>
        {!events.length && <p className="text-sm text-slate-500">Carica un evento per iniziare il check-in.</p>}
      </div>
      {isNavigating ? <p role="status" className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-600">Caricamento degli iscritti… La fotocamera è spenta.</p> : selectedEvent ? <>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold text-slate-900">{selectedEvent.titolo} <span className="whitespace-nowrap text-sm font-normal text-slate-500">{eventDate(selectedEvent.data_inizio)}</span></h2><div className="flex flex-wrap gap-x-5"><Link href={`/admin/biglietti/nuovo?event=${selectedEvent.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#234331] hover:underline">+ Iscrivi partecipante</Link><Link href={`/admin/partecipanti?event=${selectedEvent.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800">Lista completa ed esportazione →</Link><Link href={`/admin/affiliati?event=${selectedEvent.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800">Elenco affiliati →</Link><Link href={`/admin/rimborsi?event=${selectedEvent.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800">Rimborsi →</Link></div></div>
          <section aria-labelledby="participant-filters-title" className="space-y-4 rounded-2xl border border-[#d9ddcf] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="participant-filters-title" className="font-semibold text-[#263a2c]">Filtra partecipanti</h3><button type="button" onClick={resetFilters} disabled={filterDisabled || (!hasFilters && !affiliateId && !query)} className="min-h-10 text-sm font-semibold text-[#36533e] underline underline-offset-4 disabled:opacity-40">Reimposta filtri</button></div>
          {knownAffiliates.size > 0 && <div className="space-y-2"><label htmlFor="tickets-affiliate" className="block text-sm font-semibold text-[#263a2c]">Iscritti per affiliato</label><CustomSelect id="tickets-affiliate" value={affiliateId} disabled={pendingId !== null || affiliatePending || isNavigating} onChange={(event) => selectAffiliate(event.target.value)} className="min-h-12 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm">
            <option value="">Tutti gli affiliati e acquisti diretti · {eventValidCount} iscritti validi nell’evento</option>
            <option value="direct">Acquisto diretto · {affiliateCounts.get("direct") || 0} iscritti validi nell’evento</option>
            {[...knownAffiliates].map(([id, affiliate]) => <option key={id} value={id}>{affiliate.name}{!affiliate.active ? " · disattivato" : ""} · {affiliateCounts.get(id) || 0} iscritti validi nell’evento</option>)}
          </CustomSelect><p className="text-xs leading-5 text-slate-500">Sono disponibili anche gli affiliati disattivati; i numeri nel menu indicano gli iscritti validi nell’intero evento.</p></div>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label htmlFor="tickets-activity-filter" className="text-sm font-semibold text-[#4d6346]">Attività<CustomSelect id="tickets-activity-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.activity} disabled={filterDisabled} onChange={event => changeFilter("activity", event.target.value)}><option value="">Tutte le attività</option>{[...activityOptions].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</CustomSelect></label>
              <label htmlFor="tickets-formula-filter" className="text-sm font-semibold text-[#4d6346]">Formula<CustomSelect id="tickets-formula-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.formula} disabled={filterDisabled} onChange={event => changeFilter("formula", event.target.value)}><option value="">Tutte le formule</option>{filters.formula && !formulaOptions.includes(filters.formula) && <option value={filters.formula}>{filters.formula} · nessun biglietto</option>}{formulaOptions.map(formula => <option key={formula} value={formula}>{formula}</option>)}</CustomSelect></label>
              <label htmlFor="tickets-state-filter" className="text-sm font-semibold text-[#4d6346]">Stato iscrizione<CustomSelect id="tickets-state-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.status} disabled={filterDisabled} onChange={event => changeFilter("status", event.target.value)}><option value="">Tutti gli stati</option><option value="valid">Iscrizioni valide</option><option value="pending">In attesa di pagamento</option><option value="refunded">Rimborsati</option><option value="canceled">Annullati</option><option value="unknown">Da verificare</option></CustomSelect></label>
              <label htmlFor="tickets-checkin-filter" className="text-sm font-semibold text-[#4d6346]">Check-in<CustomSelect id="tickets-checkin-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.checkIn} disabled={filterDisabled} onChange={event => changeFilter("checkIn", event.target.value)}><option value="">Tutti i check-in</option><option value="without">Senza check-in</option><option value="with">Con check-in</option></CustomSelect></label>
              <label htmlFor="tickets-payment-filter" className="text-sm font-semibold text-[#4d6346]">Metodo di pagamento<CustomSelect id="tickets-payment-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.payment} disabled={filterDisabled} onChange={event => changeFilter("payment", event.target.value)}><option value="">Tutti i metodi</option><option value="online">Online</option><option value="cash">Contanti</option><option value="pos">POS / bancomat</option></CustomSelect></label>
              {(menuOptions.size > 0 || filters.menu) && <label htmlFor="tickets-menu-filter" className="text-sm font-semibold text-[#4d6346]">Menù<CustomSelect id="tickets-menu-filter" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm" value={filters.menu} disabled={filterDisabled} onChange={event => changeFilter("menu", event.target.value)}><option value="">Tutti i menù</option>{filters.menu && !menuOptions.has(filters.menu) && <option value={filters.menu}>Menù non più disponibile</option>}{[...menuOptions].sort((a, b) => a[1].localeCompare(b[1], "it")).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</CustomSelect></label>}
            </div>
            <p className="text-xs leading-5 text-slate-500">I filtri si combinano tra loro. Il check-in si riferisce all’attività selezionata; la formula può includere accessi parzialmente rimborsati. La ricerca per nome, email o codice agisce sull’elenco.</p>
          </section>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="flex items-center gap-2 text-sm text-slate-500"><Ticket aria-hidden="true" className="h-4 w-4" /> Iscritti validi</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{validTickets.length}</dd></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><dt className="flex items-center gap-2 text-sm text-emerald-800"><Users aria-hidden="true" className="h-4 w-4" /> Con check-in</dt><dd className="mt-1 text-2xl font-bold text-emerald-900">{admittedCount}</dd></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-500">Senza check-in</dt><dd className="mt-1 text-2xl font-bold text-slate-900">{validTickets.length - admittedCount}</dd></div>
          </dl>
          <p className="text-xs leading-5 text-slate-500">Conteggi riferiti ai filtri selezionati. Ogni biglietto valido conta una persona; pagamenti in attesa, iscrizioni rimborsate o annullate sono esclusi. “Con check-in” si riferisce all’attività scelta, oppure ad almeno un accesso se mostri tutte le attività.</p>
        </div>
        <section aria-labelledby="tickets-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="tickets-title" className="text-xl font-bold text-slate-900">Check-in manuale · iscritti</h2><p className="mt-1 text-sm text-slate-500">Il check-in dall’elenco non richiede la fotocamera. Per le formule, scegli un’attività alla volta.</p></div><div className="relative w-full sm:w-80"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input aria-label="Cerca nome, email o codice" disabled={filterDisabled} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome, email o codice" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm" /></div></div>
          <p role="status" className="text-sm text-slate-500">{matchingTickets.length} risultati su {scopedTickets.length} biglietti{affiliateId ? ` per ${affiliateId === "direct" ? "acquisto diretto" : knownAffiliates.get(affiliateId)?.name}` : " dell’evento"}.</p>
          {feedback && <p role="status" className={`rounded-xl border p-4 text-sm ${feedback.outcome === "admitted" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{feedback.message}</p>}
          {affiliateFeedback && <p role="status" className="rounded-xl border border-[#cedcc4] bg-[#f0f6eb] p-4 text-sm text-[#36512d]">{affiliateFeedback}</p>}
          <DataTable key={JSON.stringify([eventId, affiliateId, filters.activity, filters.formula, filters.status, filters.checkIn, filters.payment, filters.menu, query])} data={matchingTickets} columns={columns} keyExtractor={(ticket) => ticket.id} searchable={false} caption="Iscritti e check-in manuale" />
        </section>
        <QrScanner key={selectedEvent.id} events={[selectedEvent]} initialEventId={selectedEvent.id} onChecked={updateFromResult} />
      </> : <p role="status" className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-600">Seleziona un evento per vedere gli iscritti e iniziare il check-in manuale o QR.</p>}
    </div>
  );
}
