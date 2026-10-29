"use client";

import { useId, useState } from "react";
import { Link } from "@/i18n/routing";
import type { EventAffiliate } from "@/lib/events/affiliates";
import type { AffiliateCommissionValue } from "@/lib/events/affiliate-commissions";

export type AvailableAffiliate = { id: string; name: string; deletedAt?: string | null; defaultCommissionType?: AffiliateCommissionValue["commissionType"]; defaultCommissionCents?: number; defaultCommissionCredits?: number };

function defaultCommissionLabel(affiliate: AvailableAffiliate): string | null {
  if (affiliate.defaultCommissionType === "credits") return affiliate.defaultCommissionCredits === undefined ? null : `${new Intl.NumberFormat("it-IT").format(affiliate.defaultCommissionCredits)} ${affiliate.defaultCommissionCredits === 1 ? "credito" : "crediti"}`;
  return affiliate.defaultCommissionCents === undefined ? null : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(affiliate.defaultCommissionCents / 100);
}

export function EventAffiliatesPicker({ availableAffiliates, value, onChange, eventId, savedAffiliateIds, loadError, onRefresh }: {
  availableAffiliates: AvailableAffiliate[];
  value: EventAffiliate[];
  onChange: (next: EventAffiliate[]) => void;
  eventId?: string;
  savedAffiliateIds: ReadonlySet<string>;
  loadError?: string;
  onRefresh: () => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const selected = new Map(value.map(affiliate => [affiliate.id, affiliate]));
  const registryIds = new Set(availableAffiliates.map(affiliate => affiliate.id));
  const catalog = new Map(availableAffiliates.filter(affiliate => !affiliate.deletedAt || selected.has(affiliate.id)).map(affiliate => [affiliate.id, affiliate]));
  // Retain historical entries even if the registry is temporarily incomplete.
  for (const affiliate of value) if (!catalog.has(affiliate.id)) catalog.set(affiliate.id, affiliate);
  const query = search.trim().toLocaleLowerCase("it");
  const visible = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name, "it")).filter(affiliate => affiliate.name.toLocaleLowerCase("it").includes(query));
  const activeCount = value.filter(affiliate => affiliate.active && registryIds.has(affiliate.id) && !catalog.get(affiliate.id)?.deletedAt).length;
  const toggle = (affiliate: AvailableAffiliate, active: boolean) => {
    if (affiliate.deletedAt || !registryIds.has(affiliate.id)) return;
    if (active && value.some(item => item.id !== affiliate.id && item.active && item.name.toLocaleLowerCase("it") === affiliate.name.toLocaleLowerCase("it"))) {
      setNotice("Un affiliato con questo nome è già abilitato per l’evento.");
      return;
    }
    setNotice("");
    onChange(selected.has(affiliate.id)
      ? value.map(item => item.id === affiliate.id ? { ...item, active } : item)
      : [...value, { id: affiliate.id, name: affiliate.name, active }]);
  };

  return <section data-event-affiliates aria-labelledby={`${id}-title`} className="space-y-5 rounded-2xl border border-[#dedfd4] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-xl"><h2 id={`${id}-title`} className="text-xl font-bold text-[#213b2f]">Affiliati dell’evento</h2><p className="mt-2 text-sm leading-6 text-[#677362]">Abilita gli affiliati che possono portare iscritti a questo evento. Solo quelli abilitati saranno disponibili durante l’acquisto.</p></div>
      <span className="rounded-full bg-[#edf3ed] px-3 py-1.5 text-xs font-semibold text-[#36533e]">{activeCount} {activeCount === 1 ? "abilitato" : "abilitati"}</span>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#e9e9e0] pb-4 text-sm">
      <Link href="/admin/affiliati" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 font-semibold text-[#36533e] underline underline-offset-4">Gestisci affiliati <span aria-hidden="true">↗</span><span className="sr-only">(si apre in una nuova scheda)</span></Link>
      <button type="button" onClick={onRefresh} className="min-h-10 font-medium text-[#677362] underline underline-offset-4">Aggiorna elenco</button>
      <span className="text-xs leading-5 text-[#677362]">Crea i nuovi affiliati nell’anagrafica, poi aggiorna l’elenco qui.</span>
    </div>
    {loadError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{loadError} Le associazioni già salvate vengono conservate. Premi “Aggiorna elenco” per riprovare.</p>}
    {catalog.size > 0 && <div className="space-y-2"><label htmlFor={`${id}-search`} className="block text-sm font-semibold text-[#36533e]">Cerca nell’anagrafica</label><input id={`${id}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome affiliato, scuola o referente" className="min-h-11 w-full rounded-xl border border-[#d9ddcf] bg-[#fffefa] px-3 text-sm text-[#213b2f] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#36533e]" /></div>}
    {notice && <p role="alert" className="text-sm text-amber-800">{notice}</p>}
    {visible.length > 0 ? <ul className="grid gap-3 sm:grid-cols-2">{visible.map(affiliate => {
      const existing = selected.get(affiliate.id);
      const deleted = Boolean(affiliate.deletedAt);
      const unavailable = !registryIds.has(affiliate.id);
      const active = Boolean(existing?.active) && !deleted && !unavailable;
      const limitReached = !existing && value.length >= 100;
      const initialCommission = defaultCommissionLabel(affiliate);
      return <li key={affiliate.id} data-event-affiliate={affiliate.id} className={`min-w-0 rounded-xl border p-4 transition-colors ${active ? "border-[#9ead97] bg-[#f1f5ed]" : "border-[#e4e5dc] bg-[#fffefa]"}`}>
        <label className={`flex min-h-11 items-center justify-between gap-3 ${loadError || limitReached || deleted || unavailable ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <span className="min-w-0"><span className="block break-words text-sm font-semibold text-[#213b2f]">{affiliate.name}</span><span className="mt-1 block text-xs text-[#677362]">{deleted ? "Eliminato dall’anagrafica" : unavailable ? "Non disponibile nell’anagrafica" : active ? "Abilitato per questo evento" : "Non abilitato"}</span></span>
          <span className="relative inline-flex shrink-0"><input type="checkbox" role="switch" aria-label={`Abilita ${affiliate.name} per questo evento`} checked={active} disabled={Boolean(loadError) || limitReached || deleted || unavailable} onChange={event => toggle(affiliate, event.target.checked)} className="peer sr-only" /><span aria-hidden="true" className="h-7 w-12 rounded-full bg-[#d6dbd0] transition-colors peer-checked:bg-[#36533e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#36533e] peer-disabled:opacity-50" /><span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" /></span>
        </label>
        {limitReached && <p className="mt-2 text-xs text-amber-800">Raggiunto il limite di 100 affiliati per evento.</p>}
        {deleted && <p className="mt-2 text-xs leading-5 text-[#677362]">Lo storico è conservato. Ripristina l’affiliato dal Cestino per abilitarlo di nuovo.</p>}
        {!deleted && !unavailable && !savedAffiliateIds.has(affiliate.id) && initialCommission !== null && <p className="mt-2 text-xs leading-5 text-[#677362]">Compenso iniziale: {initialCommission} per iscritto valido.</p>}
        {eventId && savedAffiliateIds.has(affiliate.id) && <Link href={`/admin/affiliati/${affiliate.id}?event=${eventId}`} className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-[#36533e] underline underline-offset-4">Vedi iscritti <span aria-hidden="true" className="ml-1">→</span></Link>}
      </li>;
    })}</ul> : <p className="rounded-xl bg-[#f3f2ed] p-4 text-sm leading-6 text-[#677362]">{query ? "Nessun affiliato corrisponde alla ricerca." : loadError ? "Anagrafica temporaneamente non disponibile." : "L’anagrafica è vuota. Crea il primo affiliato dalla pagina Affiliati, poi aggiorna questo elenco."}</p>}
    <p className="text-xs leading-5 text-[#677362]">Le modifiche si applicano quando salvi l’evento. Disabilitare un affiliato lo nasconde dai nuovi acquisti e conserva tutti gli iscritti già associati. Gli acquisti diretti restano sempre disponibili.</p>
    <p className="text-xs leading-5 text-[#677362]">I nuovi abbinamenti usano il compenso predefinito dell’affiliato. Gli importi già impostati per questo evento vengono conservati.</p>
  </section>;
}
