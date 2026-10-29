"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, FolderOpen, Plus, Search, Users, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import { deleteAffiliate, restoreAffiliate } from "@/app/api/admin/affiliati/actions";
import { AffiliateWizard } from "@/components/admin/affiliate-wizard";
import type { AffiliateRegistryEntry } from "@/lib/events/affiliate-registry";
import type { AffiliateDirectoryEvent, AffiliateDirectoryRow, AffiliateParticipant, AffiliateParticipants, AffiliateProfile } from "@/lib/events/affiliate-directory";

type AffiliateRecord = { id: string; name: string; createdAt: string } & Partial<Omit<AffiliateRegistryEntry, "id" | "name" | "createdAt">>;
const dateLabel = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(value));
const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const credits = (amount: number) => `${new Intl.NumberFormat("it-IT").format(amount)} ${amount === 1 ? "credito" : "crediti"}`;
const compensation = (type: "eur" | "credits" | undefined, cents: number, amount = 0) => type === "credits" ? credits(amount) : euro(cents);
function CommissionTotals({ rows }: { rows: AffiliateDirectoryRow[] }) {
  const hasCredits = rows.some(row => row.commissionType === "credits");
  const hasEuro = !rows.length || rows.some(row => row.commissionType !== "credits");
  return <>{hasEuro && <span className="block">{euro(rows.reduce((sum, row) => sum + row.commissionCents, 0))}</span>}{hasCredits && <span className="block">{credits(rows.reduce((sum, row) => sum + (row.commissionCredits ?? 0), 0))}</span>}</>;
}
const statusLabels: Record<string, string> = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
const activityLabels: Record<string, string> = { valid: "Da utilizzare", available: "Da utilizzare", used: "Check-in registrato", refunded: "Rimborsato", canceled: "Annullato" };
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-[#dce2d5] bg-white px-3 text-sm text-[#24382c] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#8d7750]";
const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#254332] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#193426] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8d7750] disabled:opacity-60";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("it");

function AffiliateState({ id, active, archived }: { id: string; active: boolean; archived: boolean }) {
  if (id === "direct") return null;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-[#edf3e8] text-[#3c603e]" : "bg-slate-100 text-slate-600"}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${active ? "bg-[#658252]" : "bg-slate-400"}`} />{active ? "Abilitato" : archived ? "Archiviato" : "Disabilitato"}</span>;
}

function Summary({ items }: { items: { label: string; value: ReactNode; hint: string }[] }) {
  return <dl className="grid grid-cols-3 gap-2 sm:gap-3">{items.map(item => <div key={item.label} className="min-w-0 rounded-2xl border border-[#dfe4d8] bg-white p-3 sm:p-5"><dt className="min-h-8 text-[11px] font-semibold leading-4 text-[#63715b] sm:min-h-0 sm:text-xs">{item.label}</dt><dd className="mt-2 break-words text-xl font-semibold tracking-tight tabular-nums text-[#253e2e] sm:text-2xl">{item.value}<span className="mt-1.5 hidden text-xs font-normal leading-5 tracking-normal text-[#73806a] sm:block">{item.hint}</span></dd></div>)}</dl>;
}

export function AffiliatesDirectoryClient({ events, rows, selectedEventId, affiliates }: {
  events: AffiliateDirectoryEvent[]; rows: AffiliateDirectoryRow[]; selectedEventId: string; affiliates: AffiliateRecord[];
}) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [trash, setTrash] = useState(false);
  const [added, setAdded] = useState<AffiliateRecord[]>([]);
  const [created, setCreated] = useState<AffiliateRecord | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const query = search.trim().toLocaleLowerCase("it-IT");
  const profiles = new Map([...affiliates, ...added].map(affiliate => [affiliate.id, { ...affiliate, entries: [] as AffiliateDirectoryRow[] }]));
  for (const row of rows) {
    if (row.affiliateId === "direct") continue;
    if (!profiles.has(row.affiliateId)) profiles.set(row.affiliateId, { id: row.affiliateId, name: row.name, createdAt: "", entries: [] });
    profiles.get(row.affiliateId)!.entries.push(row);
  }
  const all = [...profiles.values()].map(affiliate => ({ ...affiliate, validCount: affiliate.entries.reduce((sum, entry) => sum + entry.validCount, 0) }))
    .sort((a, b) => b.validCount - a.validCount || a.name.localeCompare(b.name, "it", { sensitivity: "base" }) || a.id.localeCompare(b.id));
  const stateFiltered = all.filter(affiliate => trash ? Boolean(affiliate.deletedAt) : !affiliate.deletedAt);
  const scoped = stateFiltered.filter(affiliate => !selectedEventId || affiliate.entries.length > 0);
  const visible = scoped.filter(affiliate => `${affiliate.name} ${affiliate.entries.map(entry => entry.eventTitle).join(" ")}`.toLocaleLowerCase("it-IT").includes(query));
  const totals = scoped.flatMap(affiliate => affiliate.entries);
  const direct = rows.filter(row => row.affiliateId === "direct");
  const closeCreation = () => { setCreating(false); createButton.current?.focus(); };
  const changeEvent = (next: string) => {
    if (pending || next === selectedEventId) return;
    setSearch("");
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("event", next);
    else url.searchParams.delete("event");
    startNavigation(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
  };
  return <div aria-busy={pending} className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#8d7750]">La tua rete</p><h1 className="text-3xl font-bold tracking-tight text-[#223b2b]">Affiliati</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#65735c]">Un fascicolo per ogni affiliato. Tutti i suoi eventi, iscritti e compensi in un unico posto.</p></div><button ref={createButton} type="button" aria-expanded={creating} aria-controls="new-affiliate" onClick={() => { setCreating(value => !value); setCreated(null); }} className={primaryClass}><Plus size={17} aria-hidden="true" />Nuovo affiliato</button></header>
    {creating && <AffiliateWizard events={events} onCancel={closeCreation} onSaved={affiliate => { setAdded(current => [...current.filter(item => item.id !== affiliate.id), affiliate]); setCreated(affiliate); setSearch(""); setTrash(false); closeCreation(); router.refresh(); }} />}
    {created && <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-[#cfddc7] bg-[#edf4e7] px-4 py-3 text-sm text-[#365535]"><Check size={17} aria-hidden="true" /><span>{created.name}: affiliato creato.</span><Link href={`/admin/affiliati/${created.id}`} className="font-semibold underline underline-offset-4">Apri fascicolo</Link>{selectedEventId && <span>Se non compare, verifica il filtro evento selezionato.</span>}</p>}
    <Summary items={[{ label: trash ? "Affiliati nel cestino" : selectedEventId ? "Affiliati nell’evento" : "Affiliati in anagrafica", value: scoped.length, hint: trash ? "Ripristinabili dal loro fascicolo" : "Ogni affiliato ha il proprio fascicolo" }, { label: "Iscritti validi", value: totals.reduce((sum, row) => sum + row.validCount, 0), hint: "Partecipanti attribuiti agli affiliati" }, { label: "Compenso maturato", value: <CommissionTotals rows={totals} />, hint: selectedEventId ? "Totale per l’evento selezionato" : "Totale su tutti gli eventi" }]} />
    <div aria-label="Stato affiliati" className="inline-flex flex-wrap gap-1 rounded-xl border border-[#dce2d5] bg-white p-1"><button type="button" aria-pressed={!trash} onClick={() => { setTrash(false); setSearch(""); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${!trash ? "bg-[#eaf0e3] text-[#34502f]" : "text-[#74816b]"}`}><Users size={15} aria-hidden="true" />Attivi ({all.filter(item => !item.deletedAt).length})</button><button type="button" aria-pressed={trash} onClick={() => { setTrash(true); setSearch(""); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${trash ? "bg-[#eaf0e3] text-[#34502f]" : "text-[#74816b]"}`}><Trash2 size={15} aria-hidden="true" />Cestino ({all.filter(item => item.deletedAt).length})</button></div>
    <section aria-label="Elenco affiliati" className="overflow-hidden rounded-2xl border border-[#dde3d5] bg-white">
      <div className="grid gap-4 border-b border-[#e5e9df] p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] sm:p-5"><div className="min-w-0 space-y-2"><label htmlFor="affiliates-search" className="block text-xs font-semibold text-[#5b6c50]">Cerca nella tua rete</label><div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[#7d8b71]" /><input id="affiliates-search" type="search" value={search} onChange={event => setSearch(event.target.value)} disabled={pending} placeholder="Nome affiliato o evento…" className={`${inputClass} pl-10`} /></div></div><div className="min-w-0 space-y-2"><label htmlFor="affiliates-event" className="block text-xs font-semibold text-[#5b6c50]">Filtra per evento</label><CustomSelect id="affiliates-event" value={selectedEventId} disabled={pending} onChange={event => changeEvent(event.target.value)} className={inputClass}><option value="">Tutti gli eventi</option>{events.map(event => <option key={event.id} value={event.id}>{event.title} · {dateLabel(event.startsAt)}</option>)}</CustomSelect></div></div>
      <div className="flex items-center justify-between gap-2 px-5 py-3"><p role="status" className="text-xs font-medium text-[#6d7a62]">{pending ? "Caricamento…" : `${visible.length} ${visible.length === 1 ? "affiliato" : "affiliati"}`}</p><span className="hidden text-xs text-[#7a876e] sm:block">Seleziona un nome per aprire il fascicolo</span></div>
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_100px_130px_24px] gap-4 border-y border-[#e8ece3] bg-[#f7f9f4] px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#748168] lg:grid"><span>Affiliato</span><span>Eventi associati</span><span className="text-right">Iscritti validi</span><span className="text-right">Maturato</span><span /></div>
      {visible.length ? <ul className="divide-y divide-[#e9ede4]">{visible.map(affiliate => <li key={affiliate.id}><Link href={`/admin/affiliati/${affiliate.id}`} aria-label={`Apri fascicolo di ${affiliate.name}`} className="group grid min-w-0 grid-cols-2 gap-3 px-5 py-5 transition-colors hover:bg-[#f7f9f3] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8d7750] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_100px_130px_24px] lg:items-center lg:gap-4">
        <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1"><span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e2dfce] bg-[#f4f0e3] text-xs font-bold text-[#887448]">{initials(affiliate.name)}</span><span className="min-w-0"><span className="block break-words text-sm font-semibold text-[#2c4533] group-hover:underline group-hover:underline-offset-4">{affiliate.name}{affiliate.deletedAt && <span className="ml-2 text-[10px] font-medium text-[#8d7750]">Nel cestino</span>}</span><span className="mt-1 block text-xs text-[#7c8871]">{affiliate.entries.length ? `${affiliate.entries.length} ${affiliate.entries.length === 1 ? "evento associato" : "eventi associati"}` : "Da associare a un evento"}</span></span></div>
        <p className="col-span-2 min-w-0 break-words text-xs leading-5 text-[#68765e] lg:col-span-1">{affiliate.entries.length ? affiliate.entries.slice(0, 2).map(entry => entry.eventTitle).join(" · ") : "Disponibile nella selezione degli eventi"}{affiliate.entries.length > 2 ? ` · +${affiliate.entries.length - 2}` : ""}</p>
        <span className="text-sm tabular-nums text-[#354d3b] lg:text-right"><strong>{affiliate.entries.reduce((sum, entry) => sum + entry.validCount, 0)}</strong><span className="ml-1.5 text-xs font-normal text-[#718064] lg:hidden">iscritti validi</span></span>
        <span className="text-right text-sm font-semibold tabular-nums text-[#354d3b]"><span className="mr-1.5 text-xs font-normal text-[#718064] lg:hidden">Maturato</span><CommissionTotals rows={affiliate.entries} /></span><ArrowRight size={17} aria-hidden="true" className="hidden text-[#8d7750] lg:block" />
      </Link></li>)}</ul> : <div className="flex flex-col items-center px-5 py-10 text-center"><Users size={28} aria-hidden="true" className="mb-3 text-[#a7ad94]" /><p className="text-sm font-semibold text-[#4b6042]">{query ? "Nessun affiliato corrisponde alla ricerca." : trash ? "Il cestino è vuoto." : selectedEventId ? "Nessun affiliato associato a questo evento." : "La tua rete di affiliati parte da qui."}</p><p className="mt-2 max-w-md text-sm leading-6 text-[#78856c]">{query ? "Prova un altro nome o modifica il filtro evento." : trash ? "Gli affiliati eliminati compariranno qui e potranno essere ripristinati." : selectedEventId ? "Apri la modifica dell’evento per abilitare gli affiliati dell’anagrafica." : "Usa Nuovo affiliato per creare la prima anagrafica, poi selezionala negli eventi."}</p></div>}
    </section>
    {!trash && direct.length > 0 && <Link href="/admin/affiliati/direct" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#d9dfd0] px-4 py-3 text-sm text-[#627357]"><span>Acquisti diretti <span className="ml-1 text-xs">· {direct.reduce((sum, row) => sum + row.validCount, 0)} iscritti validi senza affiliato</span></span><span className="inline-flex items-center gap-2 text-xs font-semibold">Consulta gli eventi <ArrowRight size={15} aria-hidden="true" /></span></Link>}
    <p className="text-xs leading-5 text-[#7b876f]">I compensi si calcolano sugli iscritti validi di ogni evento. Pagamenti in attesa, rimborsi e annullamenti sono esclusi.</p>
  </div>;
}

export function AffiliateProfileClient({ affiliate: initialAffiliate, rows, events = [], initialEditing = false }: AffiliateProfile & { initialEditing?: boolean }) {
  const router = useRouter();
  const [savedAffiliate, setSavedAffiliate] = useState<AffiliateRegistryEntry | null>(null);
  const affiliate: AffiliateRegistryEntry = savedAffiliate ?? { id: initialAffiliate.id, name: initialAffiliate.name, createdAt: initialAffiliate.createdAt || "", contactName: initialAffiliate.contactName || "", email: initialAffiliate.email || "", phone: initialAffiliate.phone || "", notes: initialAffiliate.notes || "", defaultCommissionCents: initialAffiliate.defaultCommissionCents ?? 0, defaultCommissionType: initialAffiliate.defaultCommissionType ?? "eur", defaultCommissionCredits: initialAffiliate.defaultCommissionCredits ?? 0, deletedAt: initialAffiliate.deletedAt || null };
  const direct = affiliate.id === "direct";
  const deleted = Boolean(affiliate.deletedAt);
  const [editing, setEditing] = useState(() => initialEditing && !direct && !deleted);
  const [editingStep, setEditingStep] = useState<0 | 2>(initialEditing ? 2 : 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startMutation] = useTransition();
  const [message, setMessage] = useState<{success:boolean;text:string} | null>(null);
  const busy = useRef(false);
  const openEditor = (step: 0 | 2) => {
    if (pending || direct || deleted) return;
    setEditingStep(step); setEditing(true); setConfirmDelete(false); setMessage(null);
  };
  const changeDeletion = (restore: boolean) => {
    if (busy.current) return;
    busy.current = true; setMessage(null);
    startMutation(async () => {
      try {
        const result = restore ? await restoreAffiliate(affiliate.id) : await deleteAffiliate(affiliate.id);
        if (!result.success) { setMessage({success:false,text:result.error}); return; }
        setSavedAffiliate({...affiliate, deletedAt: restore ? null : new Date().toISOString()});
        setConfirmDelete(false);
        setMessage({success:true,text:restore ? "Affiliato ripristinato. Puoi abilitarlo negli eventi desiderati." : "Affiliato spostato nel cestino. Iscrizioni e compensi storici sono conservati."});
        router.refresh();
      } catch { setMessage({success:false,text:"Operazione non confermata. Controlla la connessione e riprova."}); }
      finally {busy.current = false;}
    });
  };
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("it-IT");
  const visible = rows.filter(row => row.eventTitle.toLocaleLowerCase("it-IT").includes(query));
  return <div className="min-w-0 space-y-5">
    <Link href="/admin/affiliati" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#66775b]">← Tutti gli affiliati</Link>
    <header className="flex flex-wrap items-center gap-4"><span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#dfd8bf] bg-[#f0ead8] text-lg font-semibold text-[#8c7747]">{direct ? <Users size={24} /> : initials(affiliate.name)}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#9a8553]">{direct ? "Iscrizioni senza affiliato" : "Fascicolo affiliato"}</p><h1 className="mt-1 break-words text-3xl font-bold text-[#263f2e]">{affiliate.name}</h1>{deleted && <p className="mt-2 text-xs font-semibold text-[#8d7750]">Nel cestino</p>}</div>{!direct && <div className="flex flex-wrap gap-2">{deleted ? <button type="button" disabled={pending} onClick={() => changeDeletion(true)} className={primaryClass}><RotateCcw size={16} aria-hidden="true" />{pending ? "Ripristino…" : "Ripristina affiliato"}</button> : <><button type="button" disabled={pending || editing} onClick={() => openEditor(0)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce2d5] bg-white px-4 text-sm font-semibold text-[#49613e] disabled:opacity-50"><Pencil size={15} aria-hidden="true" />Modifica affiliato</button><button type="button" disabled={pending || editing} onClick={() => {setConfirmDelete(true);setMessage(null);}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 size={15} aria-hidden="true" />Elimina affiliato</button></>}</div>}</header>
    {message && <p role={message.success ? "status" : "alert"} className={`rounded-xl border p-4 text-sm leading-6 ${message.success ? "border-[#d4dfc9] bg-[#f0f5e9] text-[#405a35]" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</p>}
    {confirmDelete && <section aria-label="Conferma eliminazione affiliato" className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-semibold text-red-900">Eliminare {affiliate.name} dall’anagrafica?</h2><p className="text-sm leading-6 text-red-800">L’affiliato verrà spostato nel cestino e disabilitato per i nuovi acquisti in tutti gli eventi. Iscritti e compensi maturati restano consultabili. Potrai ripristinarlo dal cestino.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={() => changeDeletion(false)} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Eliminazione…" : "Sposta nel cestino"}</button><button type="button" autoFocus disabled={pending} onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-800">Annulla</button></div></section>}
    {editing && !direct && !deleted && <AffiliateWizard key={editingStep} affiliate={affiliate} events={events} initialStep={editingStep} assignments={rows.map(row => ({eventId:row.eventId,commissionType:row.commissionType ?? "eur",commissionCents:row.commissionPerParticipantCents,commissionCredits:row.commissionPerParticipantCredits ?? 0,active:row.active}))} onCancel={() => setEditing(false)} onSaved={entry => {setSavedAffiliate(entry);setEditing(false);setMessage({success:true,text:"Dati e configurazione dell’affiliato aggiornati."});router.refresh();}} />}
    {!direct && !editing && <section aria-labelledby="affiliate-data-title" className="rounded-2xl border border-[#dce3d4] bg-white p-5"><h2 id="affiliate-data-title" className="text-sm font-semibold text-[#405637]">Dati dell’affiliato</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-[#7b876f]">Referente</dt><dd className="mt-1 break-words text-[#344e39]">{affiliate.contactName || "Non inserito"}</dd></div><div><dt className="text-xs text-[#7b876f]">Email</dt><dd className="mt-1 break-all text-[#344e39]">{affiliate.email || "Non inserita"}</dd></div><div><dt className="text-xs text-[#7b876f]">Telefono</dt><dd className="mt-1 break-words text-[#344e39]">{affiliate.phone || "Non inserito"}</dd></div><div><dt className="text-xs text-[#7b876f]">Compenso predefinito per iscritto</dt><dd className="mt-1 font-semibold text-[#344e39]">{compensation(affiliate.defaultCommissionType, affiliate.defaultCommissionCents, affiliate.defaultCommissionCredits)}</dd></div></dl>{affiliate.notes && <p className="mt-4 whitespace-pre-wrap break-words border-t border-[#e6eadf] pt-4 text-sm leading-6 text-[#68765e]">{affiliate.notes}</p>}<p className="mt-4 text-xs leading-5 text-[#7b876f]">Il compenso predefinito viene proposto per le nuove associazioni. I compensi già impostati sui singoli eventi restano invariati.</p></section>}
    <Summary items={[{ label: "Eventi associati", value: rows.length, hint: "Eventi abilitati e storico" }, { label: "Iscritti validi", value: rows.reduce((sum, row) => sum + row.validCount, 0), hint: "Totale sui suoi eventi" }, { label: direct ? "Totale iscrizioni" : "Compenso maturato", value: direct ? rows.reduce((sum, row) => sum + row.totalCount, 0) : <CommissionTotals rows={rows} />, hint: direct ? "Include tutti gli stati di pagamento" : "Calcolato sugli iscritti validi" }]} />
    <section aria-labelledby="affiliate-events-title" className="overflow-hidden rounded-2xl border border-[#dce3d4] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6eade] p-5"><div><h2 id="affiliate-events-title" className="flex items-center gap-2 text-base font-semibold text-[#344b37]"><CalendarDays size={18} aria-hidden="true" />Eventi {direct ? "con acquisti diretti" : "dell’affiliato"}</h2><p className="mt-1 text-xs leading-5 text-[#77846c]">Apri un evento per consultare la sua lista di iscritti.</p></div><div className="w-full sm:max-w-xs"><label htmlFor="affiliate-event-search" className="sr-only">Cerca un evento</label><input id="affiliate-event-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cerca un evento…" className={inputClass} /></div></div>
      {visible.length ? <ul className="divide-y divide-[#e6eade]">{visible.map(row => <li key={row.eventId} className="p-4 sm:p-5"><Link href={`/admin/affiliati/${affiliate.id}?event=${row.eventId}`} aria-label={`Apri iscritti di ${affiliate.name} per ${row.eventTitle}`} className="group flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#8d7750]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-base font-semibold text-[#2b4532] group-hover:underline group-hover:underline-offset-4">{row.eventTitle}</h3><AffiliateState id={affiliate.id} active={!deleted && row.active} archived={row.archived} /></div><p className="mt-1.5 text-xs text-[#7c876e]">{dateLabel(row.eventStartsAt)}</p></div><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#4b6742]">Apri iscritti <ArrowRight size={17} aria-hidden="true" /></span></Link><div className="mt-4 flex flex-wrap items-end justify-between gap-4"><dl className="flex flex-wrap gap-x-8 gap-y-3 text-xs"><div><dt className="text-[#7b876f]">Iscritti validi</dt><dd className="mt-1 font-semibold tabular-nums text-[#344e39]">{row.validCount}</dd></div><div><dt className="text-[#7b876f]">Con check-in</dt><dd className="mt-1 font-semibold tabular-nums text-[#344e39]">{row.checkedInCount}</dd></div>{!direct && <><div><dt className="text-[#7b876f]">Compenso per iscritto valido</dt><dd className="mt-1 font-semibold tabular-nums text-[#344e39]">{compensation(row.commissionType, row.commissionPerParticipantCents, row.commissionPerParticipantCredits)}</dd></div><div><dt className="text-[#7b876f]">Compenso maturato</dt><dd className="mt-1 font-semibold tabular-nums text-[#344e39]">{compensation(row.commissionType, row.commissionCents, row.commissionCredits)}</dd></div></>}</dl>{!direct && !deleted && <button type="button" disabled={pending || editing} onClick={() => openEditor(2)} aria-controls="new-affiliate" aria-label={`Imposta compenso di ${affiliate.name} per ${row.eventTitle}`} className="inline-flex min-h-10 items-center text-xs font-semibold text-[#61754d] underline underline-offset-4 disabled:opacity-50">Imposta compenso</button>}</div></li>)}</ul> : <div className="px-5 py-10 text-center"><FolderOpen size={28} aria-hidden="true" className="mx-auto mb-3 text-[#a2ac92]" /><p className="text-sm font-semibold text-[#56694a]">{query ? "Nessun evento corrisponde alla ricerca." : "Questo fascicolo non ha ancora eventi."}</p><p className="mt-2 text-sm leading-6 text-[#7b876f]">{query ? "Prova un altro titolo." : "Apri un evento e abilita questo affiliato nella sezione Affiliati."}</p>{!query && <Link href="/admin/eventi" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#49673e]">Vai agli eventi <ArrowRight size={16} aria-hidden="true" /></Link>}</div>}
    </section>
    {!direct && <p className="text-xs leading-5 text-[#7b876f]">La disabilitazione riguarda i nuovi acquisti: le iscrizioni già attribuite restano nel fascicolo.</p>}
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
    <nav aria-label="Percorso fascicolo" className="flex flex-wrap items-center gap-x-3"><Link href="/admin/affiliati" className="inline-flex min-h-11 items-center text-sm text-[#6a795e]">Affiliati</Link><span aria-hidden="true" className="text-[#a6ad9c]">/</span><Link href={`/admin/affiliati/${affiliate.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-600 underline underline-offset-4">← Fascicolo di {affiliate.name}</Link></nav>
    <header><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-bold tracking-tight text-slate-900">{affiliate.name}</h1><AffiliateState id={affiliate.id} active={affiliate.active} archived={affiliate.archived} /></div><p className="mt-2 break-words text-sm leading-6 text-slate-500">{event.title} · {dateLabel(event.startsAt)}</p></header>
    <dl className="flex flex-wrap gap-x-8 gap-y-4 border-y border-slate-200 py-4">
      <div><dt className="text-sm text-slate-500">Iscritti validi</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{validCount}</dd></div>
      <div><dt className="text-sm text-slate-500">Con check-in</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{checkedInCount}</dd></div>
      <div><dt className="text-sm text-slate-500">Totale nell’elenco</dt><dd className="mt-1 text-2xl font-semibold text-slate-900">{totalCount}</dd></div>
      {affiliate.id !== "direct" && <><div><dt className="text-sm text-slate-500">Compenso per iscritto valido</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{compensation(affiliate.commissionType, affiliate.commissionPerParticipantCents, affiliate.commissionPerParticipantCredits)}</dd></div><div><dt className="text-sm text-slate-500">Compenso maturato</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{compensation(affiliate.commissionType, affiliate.commissionCents, affiliate.commissionCredits)}</dd></div></>}
    </dl>
    {affiliate.id === "direct" ? <p className="text-sm text-slate-500">Nessun compenso per gli acquisti diretti.</p> : <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-500">{validCount} {validCount === 1 ? "iscritto valido" : "iscritti validi"} × {compensation(affiliate.commissionType, affiliate.commissionPerParticipantCents, affiliate.commissionPerParticipantCredits)} = {compensation(affiliate.commissionType, affiliate.commissionCents, affiliate.commissionCredits)}.</p><Link href={`/admin/affiliati/${affiliate.id}?edit=compensi#new-affiliate`} className="inline-flex min-h-10 items-center font-semibold text-indigo-600 underline underline-offset-4">Imposta compenso</Link></div>}
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
