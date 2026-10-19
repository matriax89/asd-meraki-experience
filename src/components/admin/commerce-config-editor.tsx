"use client";

import { CustomSelect } from "@/components/ui/custom-select";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plus, Save, Trash2, TrendingUp, Ticket, Users, Layers3, Globe } from "lucide-react";
import { saveCommerceAdmin, updateCommerceWaitlist } from "@/app/api/admin/commerce/actions";
import { DateTimeField } from "@/components/admin/date-time-field";
import { EuroInput } from "@/components/admin/euro-input";
import { WizardSteps } from "@/components/admin/wizard-steps";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import { configSchema } from "@/lib/commerce/config";
import type { CommerceConfig, CommerceActivity, CommercePackage } from "@/lib/commerce/types";
import type { CommerceSalesStats, WaitlistRow } from "@/lib/commerce/admin-types";

const input = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50";
const emptyConfig: CommerceConfig = { version: 1, enabled: false, waitlistEnabled: true, upgradesEnabled: true, activities: [], packages: [], addons: [] };
const money = (cents: number) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const steps = [
  { title: "Attività", description: "Definisci gli ingressi, i posti disponibili e gli orari di workshop, masterclass e cena." },
  { title: "Formule e prezzi", description: "Scegli quali attività comprende ogni formula e quando cambia il prezzo." },
  { title: "Cena e aggiunte", description: "Prepara gli extra facoltativi e le eventuali scelte del menù. Puoi lasciare questo passaggio vuoto." },
  { title: "Riepilogo e pubblicazione", description: "Controlla tutto prima di salvare o pubblicare. Fino alla conferma non viene modificato il sito." },
] as const;
type ConfigIssue = { path: PropertyKey[]; message: string };
type ValidatedControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const issueStep = ({ path }: ConfigIssue) => path[0] === "activities" ? path[2] === "menuOptions" ? 2 : 0 : path[0] === "packages" ? 1 : path[0] === "addons" ? 2 : 3;
const issueText = ({ path, message }: ConfigIssue) => {
  const [section, index, field, tier] = path;
  const label = section === "activities" ? `Attività ${typeof index === "number" ? index + 1 : ""}` : section === "packages" ? `Formula ${typeof index === "number" ? index + 1 : ""}${field === "prices" && typeof tier === "number" ? `, scaglione ${tier + 1}` : ""}` : section === "addons" ? `Aggiunta ${typeof index === "number" ? index + 1 : ""}` : "Configurazione";
  return `${label.trim()}: ${message}`;
};
const dateLabel = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(value)) : null;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-slate-700"><span>{label}</span>{children}</label>;
}
function DateField({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(() => ({ source: value, wall: toRomeInput(value) }));
  if (draft.source !== value) setDraft({ source: value, wall: toRomeInput(value) });
  return <DateTimeField label={label} value={draft.wall} error={error} disabled={disabled} onChange={(next) => {
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
  const [currentStep, setCurrentStep] = useState(0);
  const [maxStep, setMaxStep] = useState(initialConfig ? 3 : 0);
  const panels = useRef<(HTMLFieldSetElement | null)[]>([]);
  const wizardNavigation = useRef<HTMLDivElement>(null);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const invalidControl = useRef<ValidatedControl | null>(null);
  const [validationRequest, setValidationRequest] = useState(0);
  useEffect(() => {
    if (!navigationRequest) return;
    wizardNavigation.current?.focus({ preventScroll: true });
    wizardNavigation.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [navigationRequest]);
  useEffect(() => {
    const control = invalidControl.current;
    if (!control || control.closest("[hidden]")) return;
    invalidControl.current = null;
    control.focus();
    control.reportValidity();
  }, [currentStep, validationRequest]);
  const showIssues = (issues: ConfigIssue[]) => {
    const step = issueStep(issues[0]);
    setCurrentStep(step); setMaxStep((current) => Math.max(current, step));
    setNavigationRequest((current) => current + 1);
    setMessage({ success: false, text: issues.map(issueText).join(" · ") });
  };
  const validateNativePanel = (step: number) => {
    const panel = panels.current[step];
    if (!panel) return true;
    // Disabled panels retain the user's raw date/amount drafts. Inspect their
    // validity while enabled, then restore them before showing the first error.
    const disabledFields = [panel, ...panel.querySelectorAll<HTMLFieldSetElement | ValidatedControl>("fieldset, input, select, textarea")].filter((field) => field.disabled);
    let invalid: ValidatedControl | undefined;
    try {
      disabledFields.forEach((field) => { field.disabled = false; });
      invalid = [...panel.querySelectorAll<ValidatedControl>("input, select, textarea")].find((field) => !field.validity.valid);
    } finally { disabledFields.forEach((field) => { field.disabled = true; }); }
    if (!invalid) return true;
    setCurrentStep(step); setMaxStep((current) => Math.max(current, step));
    setMessage({ success: false, text: `${steps[step].title}: completa o correggi il campo indicato prima di continuare.` });
    invalidControl.current = invalid;
    setValidationRequest((current) => current + 1);
    return false;
  };
  const validateStep = (step: number) => {
    if (!validateNativePanel(step)) return false;
    if (step === 0 && !config.activities.length) { showIssues([{ path: ["activities"], message: "Aggiungi almeno un’attività prima di creare le formule." }]); return false; }
    const parsed = configSchema.safeParse({ ...config, enabled: true });
    const issues = parsed.success ? [] : parsed.error.issues.filter((issue) => issueStep(issue) === step);
    if (issues.length) { showIssues(issues); return false; }
    return true;
  };
  const changeStep = (next: number) => {
    if (saving || next === currentStep) return;
    if (next > currentStep) for (let step = currentStep; step < next; step++) if (!validateStep(step)) return;
    setCurrentStep(next); setMaxStep((current) => Math.max(current, next)); setMessage(null);
    setNavigationRequest((current) => current + 1);
  };
  const nextStep = () => changeStep(Math.min(currentStep + 1, 3));
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
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if (!intent) { if (currentStep < 3) nextStep(); return; }
    const publish = intent === "publish";
    if ((publish || published) && currentStep !== 3) return;
    for (let step = 0; step < 3; step++) if (!validateNativePanel(step)) return;
    const parsed = configSchema.safeParse(publish ? { ...config, enabled: true } : config);
    if (!parsed.success) { showIssues(parsed.error.issues); return; }
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
    <form noValidate onSubmit={save} onKeyDown={(event) => {
      const target = event.target as HTMLInputElement;
      if (!event.defaultPrevented && event.key === "Enter" && target.tagName === "INPUT" && !["checkbox", "radio", "hidden", "button", "submit"].includes(target.type)) {
        event.preventDefault(); if (currentStep < 3) nextStep();
      }
    }}><fieldset disabled={saving} className="min-w-0 space-y-6">
      <div ref={wizardNavigation} tabIndex={-1} className="scroll-mt-40 outline-none md:scroll-mt-24"><WizardSteps steps={steps} currentStep={currentStep} onStepChange={changeStep} maxStep={maxStep} disabled={saving} label="Configurazione dei biglietti" /></div>
      <fieldset ref={(element) => { panels.current[0] = element; }} data-commerce-step={0} hidden={currentStep !== 0} disabled={saving || currentStep !== 0} className={currentStep === 0 ? "min-w-0 space-y-5" : "hidden"}>
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Ticket className="h-5 w-5" /> Cosa potrà acquistare il partecipante?</h2>
        <p className="text-sm leading-6 text-slate-600">Un’attività è un ingresso da controllare, per esempio workshop, masterclass o cena. Le formule del prossimo passaggio possono condividere le stesse attività e gli stessi posti.</p>
        <p className="text-sm leading-6 text-slate-600">Tutte le date e gli orari seguono l’<strong>ora italiana (Europe/Rome)</strong>. Il tipo dell’evento organizza le pagine del sito; le attività acquistabili si definiscono qui.</p>
        {config.activities.length === 0 && config.packages.length === 0 && <div className="space-y-2"><ExampleButton onApply={applyExample} /><p className="text-xs leading-5 text-slate-500">Prepara Workshop, Masterclass, WS + MC e cena con prezzi illustrativi. Controlla e modifica importi, posti e date prima di pubblicare.</p></div>}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">1. Attività e disponibilità</h2><button type="button" className={button} onClick={() => setConfig((current) => ({ ...current, activities: [...current.activities, { id: makeId("activity"), name: "Nuova attività", kind: "workshop", capacity: null, startsAt: null, salesEnd: null, menuOptions: [] }] }))}><Plus className="h-4 w-4" /> Aggiungi attività</button></div>
        {config.activities.map((activity, index) => <fieldset key={activity.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="px-2 text-sm font-bold text-slate-900">Attività {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome"><input required maxLength={120} value={activity.name} onChange={(event) => patchActivity(activity.id, { name: event.target.value })} className={input} /></Field><Field label="Tipo"><CustomSelect disabled={saving || currentStep !== 0} aria-label="Tipo attività" value={activity.kind} onChange={(event) => patchActivity(activity.id, { kind: event.target.value as CommerceActivity["kind"] })} className={input}><option value="workshop">Workshop</option><option value="masterclass">Masterclass</option><option value="dinner">Cena</option><option value="extra">Altra attività</option></CustomSelect></Field><Field label="Posti totali (vuoto = senza limite)"><input type="number" min={0} max={100000} value={activity.capacity ?? ""} onChange={(event) => patchActivity(activity.id, { capacity: event.target.value === "" ? null : Number(event.target.value) })} className={input} /></Field><DateField disabled={saving || currentStep !== 0} label="Inizio attività" value={activity.startsAt} onChange={(startsAt) => patchActivity(activity.id, { startsAt })} /><DateField disabled={saving || currentStep !== 0} label="Fine prenotazioni" value={activity.salesEnd} onChange={(salesEnd) => patchActivity(activity.id, { salesEnd })} /></div><div className="flex flex-wrap items-center justify-between gap-3"><span className="max-w-lg text-xs leading-5 text-slate-500">Se hai già venduto accessi, rinomina l’attività senza eliminarla.</span><button type="button" className={`${button} text-rose-700`} onClick={() => removeActivity(activity.id)}><Trash2 className="h-4 w-4" /> Rimuovi attività</button></div></fieldset>)}
      </section>
      </fieldset>
      <fieldset ref={(element) => { panels.current[1] = element; }} data-commerce-step={1} hidden={currentStep !== 1} disabled={saving || currentStep !== 1} className={currentStep === 1 ? "min-w-0 space-y-5" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">2. Formule e scaglioni</h2><button type="button" disabled={!config.activities.length} className={button} onClick={() => setConfig((current) => ({ ...current, packages: [...current.packages, { id: makeId("package"), name: "Nuova formula", description: "", activityIds: [], prices: [{ id: makeId("tier"), label: "Standard", amountCents: 0, startsAt: null, endsAt: null }] }] }))}><Plus className="h-4 w-4" /> Aggiungi formula</button></div>
        <p className="text-sm leading-6 text-slate-600">Per Early Bird, Standard e Last Minute aggiungi uno scaglione per ogni prezzo. Imposta la fine del precedente e la stessa data come inizio del successivo: il cambio è automatico, senza sovrapposizioni. Fuori dagli intervalli non si può acquistare.</p>
        {config.packages.map((pkg, index) => <fieldset key={pkg.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><legend className="px-2 text-sm font-bold text-slate-900">Formula {index + 1}</legend><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome formula"><input required maxLength={120} value={pkg.name} onChange={(event) => patchPackage(pkg.id, { name: event.target.value })} className={input} /></Field><Field label="Descrizione"><input maxLength={1000} value={pkg.description} onChange={(event) => patchPackage(pkg.id, { description: event.target.value })} className={input} /></Field></div><fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">Attività comprese</legend><div className="flex flex-wrap gap-4">{config.activities.map((activity) => <label key={activity.id} className="flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={pkg.activityIds.includes(activity.id)} onChange={(event) => patchPackage(pkg.id, { activityIds: event.target.checked ? [...pkg.activityIds, activity.id] : pkg.activityIds.filter((id) => id !== activity.id) })} />{activity.name}</label>)}</div></fieldset>
        <div className="space-y-3">{pkg.prices.map((price, tierIndex) => <fieldset key={price.id} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><legend className="px-1 text-xs font-bold text-slate-600">Scaglione {tierIndex + 1}</legend><Field label="Etichetta"><input required maxLength={120} value={price.label} onChange={(event) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, label: event.target.value } : tier) })} className={input} /></Field><Field label="Prezzo (€)"><EuroInput required cents={price.amountCents} onCentsChange={(amountCents) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, amountCents } : tier) })} className={input} /></Field><DateField disabled={saving || currentStep !== 1} label="Valido da (vuoto = subito)" value={price.startsAt} onChange={(startsAt) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, startsAt } : tier) })} /><DateField disabled={saving || currentStep !== 1} label="Valido fino a (vuoto = nessuna fine)" value={price.endsAt} onChange={(endsAt) => patchPackage(pkg.id, { prices: pkg.prices.map((tier) => tier.id === price.id ? { ...tier, endsAt } : tier) })} /><button type="button" disabled={pkg.prices.length === 1} className={`${button} justify-self-start text-rose-700`} onClick={() => patchPackage(pkg.id, { prices: pkg.prices.filter((tier) => tier.id !== price.id) })}><Trash2 className="h-4 w-4" /> Rimuovi scaglione</button></fieldset>)}</div>
        <div className="flex flex-wrap justify-between gap-3"><button type="button" className={button} onClick={() => patchPackage(pkg.id, { prices: [...pkg.prices, { id: makeId("tier"), label: "Nuovo scaglione", amountCents: 0, startsAt: pkg.prices[pkg.prices.length - 1]?.endsAt || null, endsAt: null }] })}><Plus className="h-4 w-4" /> Aggiungi scaglione</button><button type="button" className={`${button} text-rose-700`} onClick={() => setConfig((current) => ({ ...current, packages: current.packages.filter((item) => item.id !== pkg.id) }))}><Trash2 className="h-4 w-4" /> Rimuovi formula</button></div><p className="text-xs leading-5 text-slate-500">Ogni formula usa i posti delle attività selezionate; gli acquisti già completati restano validi.</p></fieldset>)}
      </fieldset>
      <fieldset ref={(element) => { panels.current[2] = element; }} data-commerce-step={2} hidden={currentStep !== 2} disabled={saving || currentStep !== 2} className={currentStep === 2 ? "min-w-0 space-y-5" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">3. Cena e altre aggiunte</h2><button type="button" disabled={!config.activities.length} className={button} onClick={() => setConfig((current) => ({ ...current, addons: [...current.addons, { id: makeId("addon"), name: current.activities.some((activity) => activity.kind === "dinner") ? "Aggiungi la cena" : "Nuova aggiunta", activityId: current.activities.find((activity) => activity.kind === "dinner")?.id || current.activities[0]?.id || "", amountCents: 0 }] }))}><Plus className="h-4 w-4" /> Aggiungi opzione</button></div>
        <p className="text-sm text-slate-600">Le aggiunte sono facoltative, selezionabili per ogni partecipante e mai preselezionate. Un’attività già compresa nella formula non viene aggiunta due volte.</p>
        {config.addons.map((addon) => <div key={addon.id} className="grid min-w-0 items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"><Field label="Nome dell’aggiunta"><input required maxLength={120} value={addon.name} onChange={(event) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, name: event.target.value } : item) }))} className={input} /></Field><Field label="Attività associata"><CustomSelect disabled={saving || currentStep !== 2} aria-label="Attività associata" value={addon.activityId} onChange={(event) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, activityId: event.target.value } : item) }))} className={input}>{config.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</CustomSelect></Field><Field label="Prezzo (€)"><EuroInput required cents={addon.amountCents} onCentsChange={(amountCents) => setConfig((current) => ({ ...current, addons: current.addons.map((item) => item.id === addon.id ? { ...item, amountCents } : item) }))} className={input} /></Field><button type="button" className={`${button} text-rose-700`} onClick={() => setConfig((current) => ({ ...current, addons: current.addons.filter((item) => item.id !== addon.id) }))}><Trash2 className="h-4 w-4" /> Rimuovi</button></div>)}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Menù e preferenze</h3>
          <p className="text-sm leading-6 text-slate-600">Scrivi una scelta per riga solo per le attività che la richiedono, per esempio Standard e Vegetariano per la cena. Lascia vuoto se non serve. Le scelte verranno richieste solo a chi acquista quell’attività.</p>
          {config.activities.map((activity) => <Field key={activity.id} label={`Menù · ${activity.name || "Attività senza nome"}`}><textarea rows={3} value={activity.menuOptions.join("\n")} onChange={(event) => patchActivity(activity.id, { menuOptions: event.target.value.split("\n") })} onBlur={() => patchActivity(activity.id, { menuOptions: activity.menuOptions.map((option) => option.trim()).filter(Boolean) })} className={input} /></Field>)}
          <button type="button" className={button} onClick={() => changeStep(0)}>Modifica attività e posti della cena</button>
        </section>
      </fieldset>
      <fieldset ref={(element) => { panels.current[3] = element; }} data-commerce-step={3} hidden={currentStep !== 3} disabled={saving || currentStep !== 3} className={currentStep === 3 ? "min-w-0 space-y-5" : "hidden"}>
        <h2 className="text-xl font-bold text-slate-900">4. Riepilogo e pubblicazione</h2>
        <p className="text-sm leading-6 text-slate-600">Controlla i contenuti e i singoli prezzi qui sotto. Avanti e Indietro conservano le modifiche: il salvataggio avviene solo con i pulsanti di conferma.</p>
        <section aria-labelledby="review-activities" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="review-activities" className="font-bold text-slate-900">Attività e posti</h3><button type="button" className={button} onClick={() => changeStep(0)}>Modifica attività</button></div>
          <ul className="divide-y divide-slate-100">{config.activities.map((activity) => <li key={activity.id} className="space-y-1 py-3 text-sm text-slate-600"><p className="font-semibold text-slate-900">{activity.name}</p><p>{activity.capacity === null ? "Posti senza limite" : `${activity.capacity} posti totali`}</p><p>Inizio: {dateLabel(activity.startsAt) || "non impostato"}</p><p>Fine prenotazioni: {dateLabel(activity.salesEnd) || "non impostata"}</p></li>)}</ul>
        </section>
        <section aria-labelledby="review-packages" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="review-packages" className="font-bold text-slate-900">Formule e scaglioni</h3><button type="button" className={button} onClick={() => changeStep(1)}>Modifica formule e prezzi</button></div>
          <div className="space-y-4">{config.packages.map((pkg) => <div key={pkg.id} className="min-w-0 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><h4 className="font-semibold text-slate-900">{pkg.name}</h4>{pkg.description && <p className="mt-1">{pkg.description}</p>}<p className="mt-2">Comprende: {pkg.activityIds.map((id) => config.activities.find((activity) => activity.id === id)?.name || "Attività da correggere").join(" + ") || "nessuna attività selezionata"}</p><ul className="mt-3 space-y-2">{pkg.prices.map((price) => <li key={price.id} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-semibold text-slate-900">{price.label} · {money(price.amountCents)}</p><p className="mt-1">Da {dateLabel(price.startsAt) || "subito"} fino a {dateLabel(price.endsAt) || "nessuna scadenza"}</p></li>)}</ul></div>)}</div>
        </section>
        <section aria-labelledby="review-addons" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="review-addons" className="font-bold text-slate-900">Cena, aggiunte e menù</h3><button type="button" className={button} onClick={() => changeStep(2)}>Modifica cena e aggiunte</button></div>
          {config.addons.length ? <ul className="space-y-2 text-sm text-slate-600">{config.addons.map((addon) => <li key={addon.id}><strong className="text-slate-900">{addon.name} · {money(addon.amountCents)}</strong><span className="block">Attività: {config.activities.find((activity) => activity.id === addon.activityId)?.name || "da correggere"}</span></li>)}</ul> : <p className="text-sm text-slate-600">Nessuna aggiunta facoltativa.</p>}
          {config.activities.filter((activity) => activity.menuOptions.length > 0).map((activity) => <p key={activity.id} className="text-sm text-slate-600"><strong className="text-slate-900">Menù · {activity.name}:</strong> {activity.menuOptions.join(" · ")}</p>)}
        </section>
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Impostazioni della vendita</h3>
          <div className="space-y-3">{([["enabled", "Usa queste formule per la vendita"], ["waitlistEnabled", "Abilita lista d’attesa"], ["upgradesEnabled", "Permetti di aggiungere attività dopo l’acquisto"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={config[key]} onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 accent-indigo-600" />{label}</label>)}</div>
          {!config.enabled && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{published ? "Queste formule sono disattivate: l’evento mantiene la modalità di vendita precedente." : "Salva bozza mantiene l’evento nascosto. Salva e pubblica evento attiverà queste formule e renderà l’evento visibile."}</p>}
          <p className="text-xs leading-5 text-slate-500">Date e orari in ora italiana (Europe/Rome). I prezzi indicati si riferiscono alla singola formula o aggiunta.</p>
        </section>
      </fieldset>
      <div className="sticky bottom-0 z-10 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        {message && <p role="status" className={`max-h-40 overflow-y-auto rounded-xl p-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{message.text}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-xs leading-5 text-slate-500">{published ? "Le modifiche conservano i prezzi degli ordini già riservati e gli accessi acquistati." : "Salva bozza mantiene l’evento nascosto. Potrai pubblicarlo soltanto dopo il riepilogo."}</p><div className="flex flex-wrap gap-3">
          {currentStep > 0 && <button key="back" type="button" disabled={saving} className={button} onClick={(event) => { event.preventDefault(); changeStep(currentStep - 1); }}><ArrowLeft className="h-4 w-4" /> Indietro</button>}
          {(!published || currentStep === 3) && <button key="save" type="submit" name="intent" value="save" disabled={saving} className={published ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50" : button}><Save className="h-4 w-4" />{saving && !publishing ? "Salvataggio…" : published ? "Salva configurazione" : "Salva bozza"}</button>}
          {currentStep < 3 ? <button key="next" type="button" disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white disabled:opacity-50" onClick={(event) => { event.preventDefault(); nextStep(); }}>Avanti <ArrowRight className="h-4 w-4" /></button> : !published && <button key="publish" type="submit" name="intent" value="publish" disabled={saving || !config.activities.length || !config.packages.length} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-bold text-white disabled:opacity-50"><Globe className="h-4 w-4" />{publishing ? "Pubblicazione…" : "Salva e pubblica evento"}</button>}
        </div></div>
      </div>
    </fieldset></form>
    <section aria-labelledby="commerce-waitlist" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="commerce-waitlist" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5" /> Lista d’attesa ({waitlist.filter((entry) => entry.status === "waiting").length})</h2><CustomSelect aria-label="Filtra lista d'attesa" value={waitlistStatus} onChange={(event) => setWaitlistStatus(event.target.value)} className={`${input} max-w-52`}><option value="waiting">In attesa</option><option value="notified">Contattati</option><option value="removed">Chiusi</option><option value="">Tutti</option></CustomSelect></div>
      <p className="text-sm text-slate-500">Questa sezione organizza i contatti. Cambiare lo stato non invia email e non riserva posti.</p>
      {visibleWaitlist.length ? <ul className="divide-y divide-slate-100">{visibleWaitlist.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="font-bold text-slate-900">{entry.first_name} {entry.last_name}</p><p className="break-all text-sm text-slate-600">{entry.email}</p><p className="mt-1 text-xs text-slate-500">{entry.activity_ids.map((id) => config.activities.find((activity) => activity.id === id)?.name || id).join(" + ")} · {new Date(entry.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</p></div><div className="flex flex-wrap gap-2">{entry.status !== "notified" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "notified")}>{waitlistBusy === entry.id ? "Aggiornamento…" : "Segna contattato"}</button>}{entry.status !== "removed" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "removed")}>Chiudi</button>}{entry.status !== "waiting" && <button type="button" disabled={waitlistBusy !== null} className={button} onClick={() => void updateEntry(entry, "waiting")}>Riapri</button>}</div></li>)}</ul> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Nessun contatto in questo stato.</p>}
    </section>
  </div>;
}
