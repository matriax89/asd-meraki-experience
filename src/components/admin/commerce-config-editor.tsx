"use client";

import { CustomSelect } from "@/components/ui/custom-select";


import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, Save, Trash2, TrendingUp, Ticket, Users, Layers3, Globe } from "lucide-react";
import { saveCommerceAdmin, updateCommerceWaitlist } from "@/app/api/admin/commerce/actions";
import { DateTimeField } from "@/components/admin/date-time-field";
import { EuroInput } from "@/components/admin/euro-input";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import { configSchema } from "@/lib/commerce/config";
import type { CommerceConfig, CommerceActivity, CommercePackage } from "@/lib/commerce/types";
import type { CommerceSalesStats, WaitlistRow } from "@/lib/commerce/admin-types";

const input = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50";
const emptyConfig: CommerceConfig = { version: 1, enabled: false, waitlistEnabled: true, upgradesEnabled: true, activities: [], packages: [], addons: [] };
const money = (cents: number) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-slate-700"><span>{label}</span>{children}</label>;
}
function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(() => ({ source: value, wall: toRomeInput(value) }));
  if (draft.source !== value) setDraft({ source: value, wall: toRomeInput(value) });
  return <DateTimeField label={label} value={draft.wall} error={error} onChange={(next) => {
    try { const parsed = next === toRomeInput(value) ? value : fromRomeInput(next); setDraft({ source: parsed, wall: next }); setError(""); onChange(parsed); }
    catch (failure) { setDraft({ source: value, wall: next }); setError(failure instanceof Error ? failure.message : "Data non valida"); }
  }} />;
}

function ExampleButton({ onApply }: { onApply: () => void }) {
  return <button type="button" className={button} onClick={onApply}><Layers3 className="h-4 w-4" /> Usa esempio WS + MC + cena</button>;
}

export function CommerceConfigEditor({ eventId, initialConfig, stats, initialWaitlist, isPublished = true }: { eventId: string; initialConfig: CommerceConfig | null; stats: CommerceSalesStats; initialWaitlist: WaitlistRow[]; isPublished?: boolean }) {
  const [config, setConfig] = useState<CommerceConfig>(initialConfig || emptyConfig);
  const [published, setPublished] = useState(isPublished);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [waitlist, setWaitlist] = useState(initialWaitlist);
  const [waitlistBusy, setWaitlistBusy] = useState<string | null>(null);
  const [waitlistStatus, setWaitlistStatus] = useState("waiting");
  const patchActivity = (id: string, patch: Partial<CommerceActivity>) => setConfig((current) => ({ ...current, activities: current.activities.map((activity) => activity.id === id ? { ...activity, ...patch } : activity) }));
  const patchPackage = (id: string, patch: Partial<CommercePackage>) => setConfig((current) => ({ ...current, packages: current.packages.map((pkg) => pkg.id === id ? { ...pkg, ...patch } : pkg) }));
  const removeActivity = (id: string) => {
    if (config.packages.some((pkg) => pkg.activityIds.includes(id)) || config.addons.some((addon) => addon.activityId === id)) { setMessage({ success: false, text: "Rimuovi prima questa attività dalle formule e dalle aggiunte." }); return; }
    setConfig((current) => ({ ...current, activities: current.activities.filter((activity) => activity.id !== id) }));
  };
  const applyExample = () => setConfig({
    ...emptyConfig,
    activities: [
      { id: "workshop", name: "Workshop", kind: "workshop", capacity: null, startsAt: null, salesEnd: null, menuOptions: [] },
      { id: "masterclass", name: "Masterclass", kind: "masterclass", capacity: null, startsAt: null, salesEnd: null, menuOptions: [] },
      { id: "cena", name: "Cena", kind: "dinner", capacity: null, startsAt: null, salesEnd: null, menuOptions: ["Standard", "Vegetariano"] },
    ],
    packages: [
      { id: "solo-ws", name: "Solo Workshop", description: "Accesso al workshop", activityIds: ["workshop"], prices: [{ id: "standard", label: "Standard", amountCents: 3000, startsAt: null, endsAt: null }] },
      { id: "solo-mc", name: "Solo Masterclass", description: "Accesso alla masterclass", activityIds: ["masterclass"], prices: [{ id: "standard", label: "Standard", amountCents: 4000, startsAt: null, endsAt: null }] },
      { id: "ws-mc", name: "Workshop + Masterclass", description: "Le due attività in un'unica formula", activityIds: ["workshop", "masterclass"], prices: [{ id: "standard", label: "Standard", amountCents: 6000, startsAt: null, endsAt: null }] },
    ],
    addons: [{ id: "aggiungi-cena", name: "Aggiungi la cena", activityId: "cena", amountCents: 2500 }],
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    const parsed = configSchema.safeParse(publish ? { ...config, enabled: true } : config);
    if (!parsed.success) { setMessage({ success: false, text: parsed.error.issues.map((issue) => {
      const [section, index, field, tier] = issue.path;
      const label = section === "activities" ? `Attività ${typeof index === "number" ? index + 1 : ""}` : section === "packages" ? `Formula ${typeof index === "number" ? index + 1 : ""}${field === "prices" && typeof tier === "number" ? `, scaglione ${tier + 1}` : ""}` : section === "addons" ? `Aggiunta ${typeof index === "number" ? index + 1 : ""}` : "Configurazione";
      return `${label.trim()}: ${issue.message}`;
    }).join(" · ") }); return; }
    setConfig(parsed.data); setSaving(true); setPublishing(publish); setMessage(null);
    try {
      const result = await saveCommerceAdmin(eventId, parsed.data, publish ? { publish: true } : undefined);
      if (result.success && result.published) setPublished(true);
      setMessage({ success: result.success, text: result.success ? result.published ? "Evento pubblicato. Le formule e i prezzi sono ora visibili sul sito." : published ? "Configurazione salvata. Le vendite seguono ora queste impostazioni." : "Bozza salvata. L’evento resta nascosto finché non scegli Salva e pubblica evento." : result.error || "Salvataggio non riuscito." });
    }
    catch { setMessage({ success: false, text: "Connessione interrotta. Configurazione non confermata: riprova." }); }
    finally { setSaving(false); setPublishing(false); }
  };
  const updateEntry = async (entry: WaitlistRow, status: WaitlistRow["status"]) => {
    setWaitlistBusy(entry.id);
    try { const result = await updateCommerceWaitlist(eventId, entry.id, status); if (result.success) setWaitlist((current) => current.map((row) => row.id === entry.id ? { ...row, status } : row)); else setMessage({ success: false, text: result.error || "Aggiornamento non riuscito." }); }
    catch { setMessage({ success: false, text: "Connessione interrotta. Aggiornamento non confermato." }); }
    finally { setWaitlistBusy(null); }
  };
  const visibleWaitlist = waitlist.filter((entry) => !waitlistStatus || entry.status === waitlistStatus);

  return <div className="min-w-0 space-y-8">
    <section className={`rounded-2xl border p-5 ${published ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      <p className="font-bold">{published ? "Evento pubblicato" : "Evento in bozza · non visibile sul sito"}</p>
      <p className="mt-2 text-sm leading-6">{published ? "Le modifiche salvate aggiornano la vendita. I biglietti già acquistati restano protetti." : "I dettagli dell’evento sono salvati. Ora prepara attività, formule e cena; alla fine potrai salvare la bozza oppure pubblicare tutto."}</p>
    </section>
    <details open={stats.paidOrders > 0 || stats.participants > 0} className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer text-lg font-bold text-slate-900"><TrendingUp className="mr-2 inline h-5 w-5" aria-hidden="true" /> Vendite dell’evento</summary>
    <section aria-labelledby="commerce-stats" className="mt-5 space-y-4">
      <h2 id="commerce-stats" className="sr-only">Riepilogo vendite</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Incasso confermato", money(stats.revenueCents)], ["Ordini pagati", stats.paidOrders], ["Partecipanti attivi", stats.participants], ["Rimborsi completati", money(stats.refundedCents)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}</div>
      <p className="text-xs text-slate-500">Totali degli ordini avanzati confermati, esclusi gli ordini rimborsati. Le commissioni Stripe non sono sottratte. I rimborsi in corso non sono inclusi nell’incasso. I conteggi delle formule includono gli upgrade. Gli acquisti precedenti alla configurazione restano nella sezione Biglietti.</p>
      <div className="grid gap-3 lg:grid-cols-3">{([["Formule", stats.packages], ["Scaglioni", stats.tiers], ["Aggiunte", stats.addons]] as const).map(([title, rows]) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-900">{title}</h3>{rows.length ? <ul className="mt-3 space-y-2 text-sm text-slate-600">{rows.map((row) => <li key={row.id} className="flex justify-between gap-3"><span>{row.name}</span><strong>{row.count}</strong></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Nessuna vendita confermata.</p>}</div>)}</div>
    </section></details>
    <form onSubmit={save}><fieldset disabled={saving} className="min-w-0 space-y-6">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Ticket className="h-5 w-5" /> Cosa potrà acquistare il partecipante?</h2>
        <ol className="grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-3"><li className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-900">1. Attività</strong>Gli ingressi da controllare: workshop, masterclass e cena. I posti sono condivisi tra le formule.</li><li className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-900">2. Formule e prezzi</strong>Solo workshop, solo masterclass o WS + MC. Ogni formula può avere prezzi diversi in date diverse.</li><li className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-900">3. Cena facoltativa</strong>Collega la cena a un’attività e scegli il prezzo. Il partecipante può aggiungerla e scegliere il menu.</li></ol>
        <p className="text-sm leading-6 text-slate-600">Tutte le date e gli orari seguono l’<strong>ora italiana (Europe/Rome)</strong>. Il tipo dell’evento organizza le pagine del sito; le attività acquistabili si definiscono qui.</p>
        <div className="flex flex-wrap gap-5">{([["enabled", "Usa queste formule per la vendita"], ["waitlistEnabled", "Abilita lista d’attesa"], ["upgradesEnabled", "Permetti di aggiungere attività dopo l’acquisto"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 accent-indigo-600" />{label}</label>)}</div>
        {!config.enabled && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{published ? "Queste formule sono disattivate: l’evento mantiene la modalità di vendita precedente." : "Puoi preparare tutto in bozza. Salva e pubblica evento attiverà le formule e renderà visibile l’evento."}</p>}
        {config.activities.length === 0 && config.packages.length === 0 && <div className="space-y-2"><ExampleButton onApply={applyExample} /><p className="text-xs leading-5 text-slate-500">Prepara Workshop, Masterclass, WS + MC e cena con prezzi illustrativi. Controlla e modifica importi, posti e date prima di pubblicare.</p></div>}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">1. Attività e disponibilità</h2><button type="button" className={button} onClick={() => setConfig((current) => ({ ...current, activities: [...current.activities, { id: makeId("activity"), name: "Nuova attività", kind: "workshop", capacity: null, startsAt: null, salesEnd: null, menuOptions: [] }] }))}><Plus className="h-4 w-4" /> Aggiungi attività</button></div>
        {config.activities.map((activity, index) => <fieldset key={activity.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="px-2 text-sm font-bold text-slate-900">Attività {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome"><input required maxLength={120} value={activity.name} onChange={(event) => patchActivity(activity.id, { name: event.target.value })} className={input} /></Field><Field label="Tipo"><CustomSelect aria-label="Tipo attività" value={activity.kind} onChange={(event) => patchActivity(activity.id, { kind: event.target.value as CommerceActivity["kind"] })} className={input}><option value="workshop">Workshop</option><option value="masterclass">Masterclass</option><option value="dinner">Cena</option><option value="extra">Altra attività</option></CustomSelect></Field><Field label="Posti totali (vuoto = senza limite)"><input type="number" min={0} max={100000} value={activity.capacity ?? ""} onChange={(event) => patchActivity(activity.id, { capacity: event.target.value === "" ? null : Number(event.target.value) })} className={input} /></Field><DateField label="Inizio attività" value={activity.startsAt} onChange={(startsAt) => patchActivity(activity.id, { startsAt })} /><DateField label="Fine prenotazioni" value={activity.salesEnd} onChange={(salesEnd) => patchActivity(activity.id, { salesEnd })} /><Field label="Opzioni menù (una per riga, facoltativo)"><textarea rows={3} value={activity.menuOptions.join("\n")} onChange={(event) => patchActivity(activity.id, { menuOptions: event.target.value.split("\n") })} onBlur={() => patchActivity(activity.id, { menuOptions: activity.menuOptions.map((option) => option.trim()).filter(Boolean) })} className={input} /></Field></div><div className="flex flex-wrap items-center justify-between gap-3"><span className="max-w-lg text-xs leading-5 text-slate-500">Se hai già venduto accessi, rinomina l’attività senza eliminarla.</span><button type="button" className={`${button} text-rose-700`} onClick={() => removeActivity(activity.id)}><Trash2 className="h-4 w-4" /> Rimuovi attività</button></div></fieldset>)}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">2. Formule e scaglioni</h2><button type="button" disabled={!config.activities.length} className={button} onClick={() => setConfig((current) => ({ ...current, packages: [...current.packages, { id: makeId("package"), name: "Nuova formula", description: "", activityIds: [], prices: [{ id: makeId("tier"), label: "Standard", amountCents: 0, startsAt: null, endsAt: null }] }] }))}><Plus className="h-4 w-4" /> Aggiungi formula</button></div>
        <p className="text-sm leading-6 text-slate-600">Per Early Bird, Standard e Last Minute aggiungi uno scaglione per ogni prezzo. Imposta la fine del precedente e la stessa data come inizio del successivo: il cambio è automatico, senza sovrapposizioni. Fuori dagli intervalli non si può acquistare.</p>
        {config.packages.map((pkg, index) => <fieldset key={pkg.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="px-2 text-sm font-bold text-slate-900">Formula {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome formula"><input required maxLength={120} value={pkg.name} onChange={(event) => patchPackage(pkg.id, { name: event.target.value })} className={input} /></Field><Field label="Descrizione"><input maxLength={1000} value={pkg.description} onChange={(event) => patchPackage(pkg.id, { description: event.target.value })} className={input} /></Field></div><fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">Attività comprese</legend><div className="flex flex-wrap gap-4">{config.activities.map((activity) => <label key={activity.id} className="flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={pkg.activityIds.includes(activity.id)} onChange={(event) => patchPackage(pkg.id, { activityIds: event.target.checked ? [...pkg.activityIds, activity.id] : pkg.activityIds.filter((id) => id !== activity.id) })} />{activity.name}</label>)}</div></fieldset>
        <div className="space-y-3">{pkg.prices.map((price, tierIndex) => <fieldset key={price.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><legend className="px-1 text-xs font-bold text-slate-600">Scaglione {tierIndex + 1}</legend><Field label="Etichetta"><input required maxLength={120} value={price.label} onChange={(event) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, label: event.target.value } : tier) })} className={input} /></Field><Field label="Prezzo (€)"><EuroInput required cents={price.amountCents} onCentsChange={(amountCents) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, amountCents } : tier) })} className={input} /></Field><DateField label="Valido da (vuoto = subito)" value={price.startsAt} onChange={(startsAt) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, startsAt } : tier) })} /><DateField label="Valido fino a (vuoto = nessuna fine)" value={price.endsAt} onChange={(endsAt) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, endsAt } : tier) })} /><button type="button" disabled={pkg.prices.length === 1} className={`${button} justify-self-start text-rose-700`} onClick={() => patchPackage(pkg.id, { prices: pkg.prices.filter((tier) => tier.id !== price.id) })}><Trash2 className="h-4 w-4" /> Rimuovi scaglione</button></fieldset>)}</div>
        <div className="flex flex-wrap justify-between gap-3"><button type="button" className={button} onClick={() => patchPackage(pkg.id, { prices: [...pkg.prices, { id: makeId("tier"), label: "Nuovo scaglione", amountCents: 0, startsAt: pkg.prices[pkg.prices.length - 1]?.endsAt || null, endsAt: null }] })}><Plus className="h-4 w-4" /> Aggiungi scaglione</button><button type="button" className={`${button} text-rose-700`} onClick={() => setConfig((current) => ({ ...current, packages: current.packages.filter((item) => item.id !== pkg.id) }))}><Trash2 className="h-4 w-4" /> Rimuovi formula</button></div><p className="text-xs leading-5 text-slate-500">Ogni formula usa i posti delle attività selezionate; gli acquisti già completati restano validi.</p></fieldset>)}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">3. Cena e altre aggiunte</h2><button type="button" disabled={!config.activities.length} className={button} onClick={() => setConfig((current) => ({ ...current, addons: [...current.addons, { id: makeId("addon"), name: current.activities.some((activity) => activity.kind === "dinner") ? "Aggiungi la cena" : "Nuova aggiunta", activityId: current.activities.find((activity) => activity.kind === "dinner")?.id || current.activities[0]?.id || "", amountCents: 0 }] }))}><Plus className="h-4 w-4" /> Aggiungi opzione</button></div>
        <p className="text-sm text-slate-600">Le aggiunte sono facoltative, selezionabili per ogni partecipante e mai preselezionate. Un’attività già compresa nella formula non viene aggiunta due volte.</p>
        {config.addons.map((addon) => <div key={addon.id} className="grid min-w-0 items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"><Field label="Nome dell’aggiunta"><input required maxLength={120} value={addon.name} onChange={(event) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, name: event.target.value } : item) }))} className={input} /></Field><Field label="Attività associata"><CustomSelect aria-label="Attività associata" value={addon.activityId} onChange={(event) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, activityId: event.target.value } : item) }))} className={input}>{config.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</CustomSelect></Field><Field label="Prezzo (€)"><EuroInput required cents={addon.amountCents} onCentsChange={(amountCents) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, amountCents } : item) }))} className={input} /></Field><button type="button" className={`${button} text-rose-700`} onClick={() => setConfig((current) => ({ ...current, addons: current.addons.filter((item) => item.id !== addon.id) }))}><Trash2 className="h-4 w-4" /> Rimuovi</button></div>)}
      </section>
      <div className="sticky bottom-0 z-10 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        {message && <p role="status" className={`max-h-40 overflow-y-auto rounded-xl p-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{message.text}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-xs leading-5 text-slate-500">{published ? "Le modifiche conservano i prezzi degli ordini già riservati e gli accessi acquistati." : "Salva bozza mantiene l’evento nascosto. Salva e pubblica evento attiva queste formule e rende l’evento visibile al pubblico."}</p><div className="flex flex-wrap gap-3"><button type="submit" name="intent" value="save" disabled={saving} className={published ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50" : button}><Save className="h-4 w-4" />{saving && !publishing ? "Salvataggio…" : published ? "Salva configurazione" : "Salva bozza"}</button>{!published && <button type="submit" name="intent" value="publish" disabled={saving || !config.activities.length || !config.packages.length} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-bold text-white disabled:opacity-50"><Globe className="h-4 w-4" />{publishing ? "Pubblicazione…" : "Salva e pubblica evento"}</button>}</div></div>
      </div>
    </fieldset></form>
    <section aria-labelledby="commerce-waitlist" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="commerce-waitlist" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5" /> Lista d’attesa ({waitlist.filter((entry) => entry.status === "waiting").length})</h2><CustomSelect aria-label="Filtra lista d'attesa" value={waitlistStatus} onChange={(event) => setWaitlistStatus(event.target.value)} className={`${input} max-w-52`}><option value="waiting">In attesa</option><option value="notified">Contattati</option><option value="removed">Chiusi</option><option value="">Tutti</option></CustomSelect></div>
      <p className="text-sm text-slate-500">Questa sezione organizza i contatti. Cambiare lo stato non invia email e non riserva posti.</p>
      {visibleWaitlist.length ? <ul className="divide-y divide-slate-100">{visibleWaitlist.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="font-bold text-slate-900">{entry.first_name} {entry.last_name}</p><p className="break-all text-sm text-slate-600">{entry.email}</p><p className="mt-1 text-xs text-slate-500">{entry.activity_ids.map((id) => config.activities.find((activity) => activity.id === id)?.name || id).join(" + ")} · {new Date(entry.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</p></div><div className="flex flex-wrap gap-2">{entry.status !== "notified" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "notified")}>{waitlistBusy === entry.id ? "Aggiornamento…" : "Segna contattato"}</button>}{entry.status !== "removed" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "removed")}>Chiudi</button>}{entry.status !== "waiting" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "waiting")}>Riapri</button>}</div></li>)}</ul> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Nessun contatto in questo stato.</p>}
    </section>
  </div>;
}
