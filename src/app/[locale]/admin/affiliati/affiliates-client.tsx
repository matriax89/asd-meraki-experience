"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import type { AffiliateDirectoryEvent, AffiliateDirectoryRow, AffiliateParticipant, AffiliateParticipants } from "@/lib/events/affiliate-directory";

const dateLabel = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(value));
const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const statusLabels: Record<string, string> = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
const activityLabels: Record<string, string> = { valid: "Da utilizzare", available: "Da utilizzare", used: "Check-in registrato", refunded: "Rimborsato", canceled: "Annullato" };
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-500";

function AffiliateState({ id, active, archived }: { id: string; active: boolean; archived: boolean }) {
  if (id === "direct" || active) return null;
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{archived ? "Archiviato" : "Disattivato"}</span>;
}

export function AffiliatesDirectoryClient({ events, rows, selectedEventId }: {
  events: AffiliateDirectoryEvent[]; rows: AffiliateDirectoryRow[]; selectedEventId: string;
}) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("it-IT");
  const visible = rows.filter(row => `${row.name} ${row.eventTitle}`.toLocaleLowerCase("it-IT").includes(query));
  const changeEvent = (next: string) => {
    if (pending || next === selectedEventId) return;
    setSearch("");
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("event", next);
    else url.searchParams.delete("event");
    startNavigation(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
  };
  return <div aria-busy={pending} className="min-w-0 space-y-6">
    <header><h1 className="text-3xl font-bold tracking-tight text-slate-900">Affiliati</h1><p className="mt-2 text-sm leading-6 text-slate-500">Apri un affiliato per vedere le persone iscritte tramite lui, divise per evento.</p></header>
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><label htmlFor="affiliates-event" className="block text-sm font-semibold text-slate-700">Evento</label><CustomSelect id="affiliates-event" value={selectedEventId} disabled={pending} onChange={event => changeEvent(event.target.value)} className={inputClass}><option value="">Tutti gli eventi</option>{events.map(event => <option key={event.id} value={event.id}>{event.title} · {dateLabel(event.startsAt)}</option>)}</CustomSelect></div>
      <div className="min-w-0 space-y-2"><label htmlFor="affiliates-search" className="block text-sm font-semibold text-slate-700">Cerca affiliato o evento</label><input id="affiliates-search" type="search" value={search} onChange={event => setSearch(event.target.value)} disabled={pending} placeholder="Nome affiliato o evento" className={inputClass} /></div>
    </div>
    {pending ? <p role="status" className="py-6 text-sm text-slate-500">Caricamento degli affiliati…</p> : <section aria-label="Elenco affiliati" className="space-y-3">
      <p role="status" className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? "elenco disponibile" : "elenchi disponibili"}</p>
      {visible.length ? <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{visible.map(row => <li key={`${row.eventId}:${row.affiliateId}`}>
        <Link href={`/admin/affiliati/${row.affiliateId}?event=${row.eventId}`} aria-label={`Apri iscritti di ${row.name} per ${row.eventTitle}`} className="grid min-w-0 gap-3 px-4 py-4 outline-offset-[-3px] transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-words text-base font-semibold text-slate-900">{row.name}</span><AffiliateState id={row.affiliateId} active={row.active} archived={row.archived} /></div><p className="mt-1 break-words text-sm leading-5 text-slate-500">{row.eventTitle} · {dateLabel(row.eventStartsAt)}</p></div>
          <div className="flex items-center justify-between gap-5 sm:justify-end"><span className="text-sm text-slate-600"><strong className="text-base text-slate-900">{row.validCount}</strong> {row.validCount === 1 ? "iscritto valido" : "iscritti validi"}</span><span className="whitespace-nowrap text-sm font-semibold text-indigo-600">Apri elenco <span aria-hidden="true">→</span></span></div>
        </Link>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 pb-4 text-sm sm:px-5">{row.affiliateId === "direct" ? <p className="text-slate-500">Nessun compenso per gli acquisti diretti.</p> : <><dl className="flex flex-wrap gap-x-6 gap-y-2"><div><dt className="text-xs text-slate-500">Compenso per iscritto valido</dt><dd className="mt-1 font-semibold tabular-nums text-slate-700">{euro(row.commissionPerParticipantCents)}</dd></div><div><dt className="text-xs text-slate-500">Compenso maturato</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900">{euro(row.commissionCents)}</dd></div></dl><Link href={`/admin/eventi/${row.eventId}#compensi-affiliati`} aria-label={`Imposta compenso di ${row.name} per ${row.eventTitle}`} className="inline-flex min-h-10 items-center font-semibold text-indigo-600 underline underline-offset-4">Imposta compenso</Link></>}</div>
      </li>)}</ul> : <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm leading-6 text-slate-500"><p>{query ? "Nessun affiliato corrisponde alla ricerca." : "Non ci sono affiliati per questo elenco."}</p>{!query && <p className="mt-2">Puoi aggiungerli nella creazione o modifica dell’evento.</p>}</div>}
      <p className="text-xs leading-5 text-slate-500">Ogni partecipante conta una sola volta, anche se acquista più attività. Il compenso maturato è il compenso per iscritto moltiplicato per gli iscritti validi dell’evento. Gli iscritti validi escludono pagamenti in attesa, rimborsi e annullamenti.</p>
    </section>}
  </div>;
}

export function AffiliateParticipantsClient({ event, affiliate, participants, validCount, checkedInCount, totalCount }: {
  event: AffiliateDirectoryEvent;
  affiliate: AffiliateParticipants["affiliate"];
  participants: AffiliateParticipant[];
  validCount: number; checkedInCount: number; totalCount: number;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("it-IT");
  const visible = participants.filter(participant => `${participant.name} ${participant.email}`.toLocaleLowerCase("it-IT").includes(query));
  return <div className="min-w-0 space-y-6">
    <Link href={`/admin/affiliati?event=${event.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-600 underline underline-offset-4">← Elenco affiliati</Link>
    <header><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-bold tracking-tight text-slate-900">{affiliate.name}</h1><AffiliateState id={affiliate.id} active={affiliate.active} archived={affiliate.archived} /></div><p className="mt-2 break-words text-sm leading-6 text-slate-500">{event.title} · {dateLabel(event.startsAt)}</p></header>
    <dl className="flex flex-wrap gap-x-8 gap-y-4 border-y border-slate-200 py-4">
      <div><dt className="text-sm text-slate-500">Iscritti validi</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{validCount}</dd></div>
      <div><dt className="text-sm text-slate-500">Con check-in</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{checkedInCount}</dd></div>
      <div><dt className="text-sm text-slate-500">Totale nell’elenco</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{totalCount}</dd></div>
      {affiliate.id !== "direct" && <><div><dt className="text-sm text-slate-500">Compenso per iscritto valido</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{euro(affiliate.commissionPerParticipantCents)}</dd></div><div><dt className="text-sm text-slate-500">Compenso maturato</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{euro(affiliate.commissionCents)}</dd></div></>}
    </dl>
    {affiliate.id === "direct" ? <p className="text-sm text-slate-500">Nessun compenso per gli acquisti diretti.</p> : <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-500">{validCount} {validCount === 1 ? "iscritto valido" : "iscritti validi"} × {euro(affiliate.commissionPerParticipantCents)} = {euro(affiliate.commissionCents)} maturati.</p><Link href={`/admin/eventi/${event.id}#compensi-affiliati`} className="inline-flex min-h-10 items-center font-semibold text-indigo-600 underline underline-offset-4">Imposta compenso</Link></div>}
    <div className="flex flex-wrap items-end justify-between gap-4"><div className="w-full space-y-2 sm:max-w-sm"><label htmlFor="affiliate-participants-search" className="block text-sm font-semibold text-slate-700">Cerca nome o email</label><input id="affiliate-participants-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome o email del partecipante" className={inputClass} /></div><Link href={`/admin/biglietti?event=${event.id}&affiliate=${affiliate.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Apri check-in per questo elenco <span className="ml-2" aria-hidden="true">→</span></Link></div>
    <section aria-label={`Iscritti di ${affiliate.name}`} className="space-y-3">
      <p role="status" className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? "partecipante" : "partecipanti"} su {totalCount} nell’elenco.</p>
      {visible.length ? <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">{visible.map(participant => <li key={participant.id} className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,.7fr)] md:gap-5 md:px-5">
        <div className="min-w-0"><h2 className="break-words text-sm font-semibold text-slate-900">{participant.name}</h2>{participant.email && <p className="mt-1 break-all text-sm leading-5 text-slate-500">{participant.email}</p>}</div>
        <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-700">{participant.packageName || "Ingresso evento"}</p>{participant.activities.length > 0 && <ul className="mt-1.5 space-y-1">{participant.activities.map(activity => <li key={activity.id} className="break-words text-xs leading-5 text-slate-500">{activity.name} · {activityLabels[activity.status] || "Da verificare"}{activity.menuChoice ? ` · ${activity.menuChoice}` : ""}</li>)}</ul>}</div>
        <div className="min-w-0"><span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${participant.status === "refunded" || participant.status === "canceled" ? "bg-rose-50 text-rose-700" : participant.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{statusLabels[participant.status] || "Da verificare"}</span><p className="mt-1.5 text-xs leading-5 text-slate-500">{participant.checkedIn ? "Check-in registrato" : ["paid", "used"].includes(participant.status) ? "Check-in da effettuare" : "Check-in non disponibile"}</p></div>
      </li>)}</ul> : <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">{query ? "Nessun partecipante corrisponde alla ricerca." : "Non ci sono ancora iscritti per questo affiliato."}</p>}
      <p className="text-xs leading-5 text-slate-500">I totali riguardano solo questo affiliato e questo evento. “Con check-in” indica almeno un accesso registrato. Pagamenti in attesa, rimborsi e annullamenti restano consultabili e non sono conteggiati tra gli iscritti validi.</p>
    </section>
  </div>;
}
