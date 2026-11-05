"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import { ParticipantDetailsButton } from "@/components/admin/participant-details-button";
import type { ParticipantRoster } from "@/lib/admin/participant-roster-types";

const panel = "min-w-0 rounded-2xl border border-[#dce2d5] bg-white p-4 sm:p-5";
const input = "min-h-11 w-full min-w-0 rounded-xl border border-[#dce2d5] bg-white px-3 text-sm text-[#24382c]";
const action = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dce2d5] bg-white px-4 text-sm font-semibold text-[#36533e] underline-offset-4 hover:underline";
const statusLabels: Record<string, string> = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
const activityLabels: Record<string, string> = { valid: "Da utilizzare", available: "Da utilizzare", used: "Check-in registrato", refunded: "Rimborsato", canceled: "Annullato" };
const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value)) : "Non disponibile";
const text = (value: string | null) => value || "Non disponibile";

export function ParticipantsClient({ data, initialStatus = "all" }: { data: ParticipantRoster; initialStatus?: "all" | "valid" }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "valid">(initialStatus);
  const [affiliateId, setAffiliateId] = useState(data.affiliate?.id || "all");
  const affiliates = new Map<string, string>();
  for (const person of data.participants) affiliates.set(person.affiliateId || "direct", person.affiliateName || "Acquisti diretti");
  if (data.affiliate) affiliates.set(data.affiliate.id, data.affiliate.name);
  const affiliated = data.participants.filter(person => affiliateId === "all" || (person.affiliateId || "direct") === affiliateId);
  const validCount = affiliated.filter(person => person.valid).length;
  const checkedInCount = affiliated.filter(person => person.valid && person.checkedIn).length;
  const query = search.trim().toLocaleLowerCase("it-IT");
  const visible = affiliated.filter(person => (status === "all" || person.valid) && (!query || [person.firstName, person.lastName, person.email, person.phone, person.buyerEmail, person.packageName, person.affiliateName, ...person.activities.flatMap(activity => [activity.name, activity.menuChoice])].filter(Boolean).join(" ").toLocaleLowerCase("it-IT").includes(query)));
  const exportParams = new URLSearchParams({ event: data.event.id, affiliate: affiliateId, status, documents: "1" });

  return <div className="min-w-0 space-y-5 text-[#24382c]">
    <nav aria-label="Gestione partecipanti" className="flex flex-wrap gap-3"><Link href="/admin/partecipanti" className={action}>Scegli evento</Link><Link href={`/admin/biglietti?event=${data.event.id}`} className={action}>Iscritti e check-in</Link><Link href={`/admin/affiliati?event=${data.event.id}`} className={action}>Affiliati dell’evento</Link></nav>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-[#8d7750]">Elenco completo</p><h1 className="mt-1 break-words text-3xl font-semibold">Partecipanti · {data.event.title}</h1><p className="mt-2 text-sm text-[#63715b]">{dateTime(data.event.startsAt)}{data.affiliate ? ` · ${data.affiliate.name}` : " · Tutti gli affiliati e acquisti diretti"}</p></div><a href={`/api/admin/participants/export?${exportParams}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#254332] px-4 text-sm font-semibold text-white">Esporta CSV completo</a></header>
    <p className="text-xs leading-5 text-[#63715b]">Il CSV comprende recapiti, codice fiscale o documento e gli altri dati di iscrizione. Esporta tutte le persone per affiliato e stato selezionati; la ricerca non limita il file. Nell’elenco i documenti restano mascherati.</p>
    {data.event.canceled && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Evento annullato. Le iscrizioni restano consultabili nello storico.</p>}
    <dl className="grid gap-3 sm:grid-cols-3">{[{ label: "Iscritti validi", value: validCount }, { label: "Con check-in", value: checkedInCount }, { label: "Totale nell’elenco", value: affiliated.length }].map(item => <div key={item.label} className={panel}><dt className="text-xs text-[#63715b]">{item.label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</dd></div>)}</dl>
    <section aria-label="Filtri partecipanti" className={`${panel} grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]`}>
      <div className="space-y-2"><label htmlFor="roster-search" className="block text-xs font-semibold text-[#53654b]">Cerca partecipante</label><input id="roster-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, email, telefono o attività…" className={input} /></div>
      <div className="space-y-2"><label htmlFor="roster-affiliate" className="block text-xs font-semibold text-[#53654b]">Affiliato</label><CustomSelect id="roster-affiliate" value={affiliateId} disabled={Boolean(data.affiliate)} onChange={event => setAffiliateId(event.target.value)} className={input}>{!data.affiliate && <option value="all">Tutti gli affiliati e acquisti diretti</option>}{[...affiliates].sort((a, b) => a[1].localeCompare(b[1], "it")).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</CustomSelect>{data.affiliate && <Link href={`/admin/partecipanti?event=${data.event.id}`} className="inline-flex min-h-9 items-center text-xs font-semibold text-[#36533e] underline underline-offset-4">Mostra tutti i partecipanti dell’evento</Link>}</div>
      <div className="space-y-2"><label htmlFor="roster-status" className="block text-xs font-semibold text-[#53654b]">Stato iscrizioni</label><CustomSelect id="roster-status" value={status} onChange={event => setStatus(event.target.value === "valid" ? "valid" : "all")} className={input}><option value="all">Tutte, incluso lo storico</option><option value="valid">Solo iscritti validi</option></CustomSelect></div>
    </section>
    <section aria-labelledby="roster-list-title" className="space-y-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="roster-list-title" className="text-lg font-semibold">Elenco partecipanti</h2><p role="status" className="text-xs text-[#63715b]">{visible.length} {visible.length === 1 ? "persona visualizzata" : "persone visualizzate"}</p></div>
      {visible.length ? <ul className="space-y-3">{visible.map(person => <li key={`${person.source}:${person.id}`} data-roster-person={person.id} className={panel}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.7fr)]"><div className="min-w-0"><div className="flex items-center justify-between gap-3"><h3 className="break-words text-base font-semibold">{[person.firstName, person.lastName].filter(Boolean).join(" ") || "Partecipante"}</h3><ParticipantDetailsButton eventId={data.event.id} participantId={person.id} source={person.source} name={[person.firstName, person.lastName].filter(Boolean).join(" ") || "Partecipante"} /></div><dl className="mt-2 space-y-2 text-sm"><div><dt className="text-xs text-[#63715b]">Email partecipante</dt><dd className="break-all">{text(person.email)}</dd></div><div><dt className="text-xs text-[#63715b]">Telefono</dt><dd className="break-words">{text(person.phone)}</dd></div><div><dt className="text-xs text-[#63715b]">Affiliato attuale</dt><dd className="break-words">{person.affiliateName || "Acquisti diretti"}</dd></div></dl></div>
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{person.packageName || "Ingresso evento"}</p>{person.activities.length > 0 ? <ul className="mt-2 space-y-2">{person.activities.map((activity, index) => <li key={`${activity.id}:${index}`} className="break-words text-xs leading-5 text-[#63715b]"><strong className="font-semibold text-[#405637]">{activity.name}</strong> · {activityLabels[activity.status] || "Da verificare"}{activity.menuChoice ? ` · Menu: ${activity.menuChoice}` : ""}{activity.checkedInAt && <span className="block">{dateTime(activity.checkedInAt)}</span>}</li>)}</ul> : <p className="mt-2 text-xs text-[#63715b]">Ingresso evento · biglietto precedente</p>}</div>
        <div><span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${person.valid ? "bg-[#edf3e8] text-[#36533e]" : "bg-rose-50 text-rose-700"}`}>{statusLabels[person.status] || "Da verificare"}</span><p className="mt-2 text-xs leading-5 text-[#63715b]">{person.valid ? "Iscrizione valida" : "Non conteggiato tra gli iscritti validi"}</p><p className="mt-2 text-xs leading-5 text-[#63715b]">{person.checkedIn ? `Check-in registrato · ${dateTime(person.checkedInAt)}` : person.valid ? "Check-in da effettuare" : "Check-in non disponibile"}</p></div></div>
        <details className="mt-4 border-t border-[#e5eadf] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#53654b]">Altri dati di iscrizione</summary><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">{[
          { label: "Email acquirente", value: text(person.buyerEmail) },
          { label: "Tipo documento", value: person.documentType === "codice_fiscale" ? "Codice fiscale" : person.documentType === "foreign_id" ? "Documento estero" : "Non disponibile" },
          { label: "Paese documento", value: text(person.documentCountry) },
          { label: "Documento mascherato", value: text(person.maskedDocument) },
          { label: "Data iscrizione", value: dateTime(person.createdAt) },
          { label: "Primo check-in registrato", value: dateTime(person.checkedInAt) },
          { label: "Data raccolta recapiti", value: dateTime(person.contactCreatedAt) },
          { label: "Versione informativa privacy", value: text(person.privacyVersion) },
          { label: "Preferenza marketing all’iscrizione", value: person.marketingConsent === null ? "Non disponibile" : person.marketingConsent ? "Sì" : "No" },
        ].map(item => <div key={item.label}><dt className="text-[#63715b]">{item.label}</dt><dd className="mt-1 break-words">{item.value}</dd></div>)}</dl>{!person.contactAvailable && <p className="mt-3 text-xs leading-5 text-[#63715b]">Dati di iscrizione storici incompleti: sono mostrati soltanto i valori disponibili.</p>}</details>
      </li>)}</ul> : <p className={`${panel} text-sm text-[#63715b]`}>{data.participants.length === 0 ? "Non ci sono ancora partecipanti per questo elenco." : "Nessun partecipante corrisponde ai filtri selezionati."}</p>}
      <p className="text-xs leading-5 text-[#63715b]">Ogni persona conta una sola volta, anche dopo un cambio formula. Rimborsi e annullamenti sono consultabili e non aumentano il numero degli iscritti validi.</p>
    </section>
  </div>;
}
