"use client";

import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Search, X } from "lucide-react";
import { createAffiliate, updateAffiliate } from "@/app/api/admin/affiliati/actions";
import { WizardSteps } from "@/components/admin/wizard-steps";
import { AffiliateCommissionInput, affiliateCommissionDraft, parseAffiliateCommissionDraft, formatAffiliateCommission, affiliateCommissionValidationMessage, type AffiliateCommissionDraft } from "@/components/admin/affiliate-commission-input";
import { affiliateProfileSchema, type AffiliateRegistryEntry } from "@/lib/events/affiliate-profile-schema";
import type { AffiliateDirectoryEvent } from "@/lib/events/affiliate-directory";

export type AffiliateWizardAssignment = { eventId: string; commissionCents: number; commissionType?: "eur" | "credits"; commissionCredits?: number; active?: boolean };
export type AffiliateWizardProps = {
  affiliate?: AffiliateRegistryEntry;
  events: AffiliateDirectoryEvent[];
  assignments?: AffiliateWizardAssignment[];
  onSaved: (affiliate: AffiliateRegistryEntry) => void;
  onCancel: () => void;
};

const steps = [
  { title: "Dati", description: "Il nome pubblico dell’affiliato e i contatti riservati al pannello." },
  { title: "Compenso", description: "Scegli il compenso di partenza per ogni iscritto valido." },
  { title: "Eventi", description: "Associa gli eventi ora oppure completa questo passaggio in seguito." },
  { title: "Riepilogo", description: "Controlla i dati: il salvataggio avviene soltanto alla conferma finale." },
] as const;
const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-[#dce2d5] bg-white px-3 text-sm text-[#24382c] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#8d7750] disabled:opacity-60";
const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#254332] px-4 text-sm font-semibold text-white hover:bg-[#193426] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8d7750] disabled:opacity-60";
const assignmentDraft = (entry: AffiliateWizardAssignment) => affiliateCommissionDraft({ commissionType: entry.commissionType ?? "eur", commissionCents: entry.commissionCents, commissionCredits: entry.commissionCredits ?? 0 });
const dateLabel = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(value));

export function AffiliateWizard({ affiliate, events, assignments = [], onSaved, onCancel }: AffiliateWizardProps) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [draft, setDraft] = useState(() => ({ name: affiliate?.name || "", contactName: affiliate?.contactName || "", email: affiliate?.email || "", phone: affiliate?.phone || "", notes: affiliate?.notes || "" }));
  const [defaultRate, setDefaultRate] = useState(() => affiliateCommissionDraft({ commissionType: affiliate?.defaultCommissionType ?? "eur", commissionCents: affiliate?.defaultCommissionCents ?? 0, commissionCredits: affiliate?.defaultCommissionCredits ?? 0 }));
  const [eventRates, setEventRates] = useState<Record<string, AffiliateCommissionDraft>>(() => Object.fromEntries(assignments.filter(entry => entry.active !== false).map(entry => [entry.eventId, assignmentDraft(entry)])));
  const rememberedRates = useRef(new Map(assignments.map(entry => [entry.eventId, assignmentDraft(entry)])));
  const [eventSearch, setEventSearch] = useState("");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const query = eventSearch.trim().toLocaleLowerCase("it-IT");
  const visibleEvents = events.filter(event => event.title.toLocaleLowerCase("it-IT").includes(query));
  const selectedEvents = events.filter(event => eventRates[event.id] !== undefined);
  const missingEvents = Object.keys(eventRates).filter(eventId => !events.some(event => event.id === eventId));
  const nameId = `${id}-name`;

  useEffect(() => { heading.current?.focus(); }, [step]);

  const showError = (text: string, field?: string) => {
    setError({ text, field });
    if (field) requestAnimationFrame(() => document.getElementById(`${id}-${field}`)?.focus());
  };
  const validate = (targetStep: number) => {
    if (targetStep === 0) {
      const parsed = affiliateProfileSchema.safeParse(draft);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        showError(issue?.message || "Controlla i dati dell’affiliato.", String(issue?.path[0] || "name"));
        return false;
      }
    }
    if (targetStep === 1 && parseAffiliateCommissionDraft(defaultRate) === null) {
      showError(`Controlla il compenso predefinito: ${affiliateCommissionValidationMessage(defaultRate)}`, "default-rate");
      return false;
    }
    if (targetStep === 2) {
      if (missingEvents.length) { showError("Un evento associato non è più disponibile. Ricarica il fascicolo prima di salvare."); return false; }
      for (const event of selectedEvents) if (parseAffiliateCommissionDraft(eventRates[event.id]) === null) {
        showError(`Controlla il compenso per ${event.title}: ${affiliateCommissionValidationMessage(eventRates[event.id])}`, `rate-${event.id}`);
        return false;
      }
    }
    setError(null);
    return true;
  };
  const goTo = (next: number) => {
    if (pending || next < 0 || next > steps.length - 1) return;
    if (next > step) for (let index = 0; index < next; index++) if (!validate(index)) { setStep(index); return; }
    setError(null); setStep(next); setMaxStep(current => Math.max(current, next));
  };
  const toggleEvent = (eventId: string, selected: boolean) => setEventRates(current => {
    const next = { ...current };
    if (selected) next[eventId] = rememberedRates.current.get(eventId) ?? defaultRate;
    else { rememberedRates.current.set(eventId, current[eventId]); delete next[eventId]; }
    return next;
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    if (step < steps.length - 1) { goTo(step + 1); return; }
    for (let index = 0; index < 3; index++) if (!validate(index)) { setStep(index); return; }
    const input = {
      ...draft,
      defaultCommissionType: defaultRate.commissionType,
      defaultCommissionCents: parseAffiliateCommissionDraft(defaultRate)!.commissionCents,
      defaultCommissionCredits: parseAffiliateCommissionDraft(defaultRate)!.commissionCredits,
      assignments: selectedEvents.map(entry => ({ eventId: entry.id, ...parseAffiliateCommissionDraft(eventRates[entry.id])! })),
    };
    busy.current = true;
    startTransition(async () => {
      try {
        const result = affiliate ? await updateAffiliate(affiliate.id, input) : await createAffiliate(input);
        if (!result.success) { showError(result.error); return; }
        onSaved(result.affiliate);
      } catch { showError("Salvataggio non confermato. I dati inseriti sono ancora qui: controlla la connessione e riprova."); }
      finally { busy.current = false; }
    });
  };
  const field = (key: keyof typeof draft) => ({
    id: `${id}-${key}`, value: draft[key], disabled: pending, "aria-invalid": error?.field === key,
    "aria-describedby": error?.field === key ? `${id}-error` : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(current => ({ ...current, [key]: event.target.value })),
  });

  return <section id="new-affiliate" aria-labelledby={`${id}-title`} className="min-w-0 space-y-5 rounded-3xl border border-[#cfdac5] bg-[#f7f9f3] p-4 sm:p-6">
    <header className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#8d7750]">{affiliate ? "Gestisci anagrafica" : "Amplia la tua rete"}</p><h2 id={`${id}-title`} className="mt-1 text-xl font-bold text-[#263f2e]">{affiliate ? "Modifica affiliato" : "Nuovo affiliato"}</h2><p className="mt-2 text-sm leading-6 text-[#63715b]">Dati, compenso ed eventi: tutto in un unico percorso.</p></div><button type="button" onClick={onCancel} disabled={pending} aria-label={affiliate ? "Chiudi modifica affiliato" : "Chiudi creazione affiliato"} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[#5c6d50] hover:bg-white disabled:opacity-50"><X size={18} /></button></header>
    <WizardSteps steps={steps} currentStep={step} maxStep={maxStep} onStepChange={goTo} disabled={pending} label={affiliate ? "Modifica affiliato" : "Crea affiliato"} />
    <form onSubmit={submit} noValidate aria-busy={pending} className="min-w-0 space-y-5">
      <fieldset disabled={pending} className="min-w-0 space-y-4 rounded-2xl border border-[#e1e6d8] bg-white p-4 sm:p-5">
        <legend className="sr-only">{steps[step].title}</legend>
        <h3 ref={heading} tabIndex={-1} className="text-base font-semibold text-[#344d38] outline-none">{step === 0 ? "Dati dell’affiliato" : step === 1 ? "Compenso predefinito" : step === 2 ? "Eventi associati" : "Controlla e conferma"}</h3>
        {step === 0 && <>
          <div className="space-y-2"><label htmlFor={nameId} className="block text-sm font-semibold text-[#4c6044]">Nome e cognome o nome della scuola <span aria-hidden="true">*</span></label><input {...field("name")} required maxLength={120} autoComplete="off" placeholder="Es. Maria Rossi o Scuola Meraki" className={inputClass} /><p className="text-xs leading-5 text-[#78856b]">È il nome visibile durante l’acquisto del biglietto.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor={`${id}-contactName`} className="block text-sm font-semibold text-[#4c6044]">Referente <span className="font-normal text-[#7c886f]">(facoltativo)</span></label><input {...field("contactName")} maxLength={120} autoComplete="name" placeholder="Persona da contattare" className={inputClass} /></div><div className="space-y-2"><label htmlFor={`${id}-email`} className="block text-sm font-semibold text-[#4c6044]">Email <span className="font-normal text-[#7c886f]">(facoltativa)</span></label><input {...field("email")} type="email" maxLength={254} autoComplete="email" placeholder="nome@esempio.it" className={inputClass} /></div><div className="space-y-2"><label htmlFor={`${id}-phone`} className="block text-sm font-semibold text-[#4c6044]">Telefono <span className="font-normal text-[#7c886f]">(facoltativo)</span></label><input {...field("phone")} type="tel" maxLength={40} autoComplete="tel" placeholder="Es. +39 333 1234567" className={inputClass} /></div></div>
          <div className="space-y-2"><label htmlFor={`${id}-notes`} className="block text-sm font-semibold text-[#4c6044]">Note interne <span className="font-normal text-[#7c886f]">(facoltative)</span></label><textarea {...field("notes")} maxLength={2000} rows={3} placeholder="Accordi o informazioni utili alla gestione" className={`${inputClass} py-3`} /></div><p className="rounded-xl bg-[#f5f7f0] px-3 py-2.5 text-xs leading-5 text-[#6c7b5f]">Referente, contatti e note restano riservati al pannello amministrativo.</p>
        </>}
        {step === 1 && <>
          <p className="text-sm leading-6 text-[#6e7c62]">Scegli euro oppure crediti e indica quanto riconoscere per ogni iscritto valido. Non vengono effettuate conversioni tra le due unità.</p><div className="max-w-sm"><AffiliateCommissionInput id={`${id}-default-rate`} value={defaultRate} onChange={setDefaultRate} label="Compenso per iscritto valido" context="Compenso predefinito" disabled={pending} invalid={error?.field === "default-rate"} errorId={`${id}-error`} /></div><div className="rounded-xl border border-[#e3dfcc] bg-[#f7f4e9] p-4 text-sm leading-6 text-[#796c4e]"><strong className="font-semibold">Vale per le nuove associazioni.</strong> Modificare importo o unità non ricalcola i compensi degli eventi già associati. I compensi esistenti si modificano nel passaggio Eventi o nella gestione dell’evento.</div>
        </>}
        {step === 2 && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm leading-6 text-[#6e7c62]">Abilita gli eventi a cui partecipa l’affiliato e controlla il compenso di ciascuno.</p><span className="rounded-full bg-[#edf3e8] px-3 py-1.5 text-xs font-semibold text-[#527044]">{selectedEvents.length} {selectedEvents.length === 1 ? "evento selezionato" : "eventi selezionati"}</span></div>
          {events.length > 0 && <div className="space-y-2"><label htmlFor={`${id}-event-search`} className="block text-xs font-semibold text-[#65775a]">Cerca un evento</label><div className="relative"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[#7e8b70]" /><input id={`${id}-event-search`} type="search" value={eventSearch} onChange={event => setEventSearch(event.target.value)} placeholder="Titolo dell’evento…" className={`${inputClass} pl-9`} /></div></div>}
          {visibleEvents.length ? <ul className="space-y-3">{visibleEvents.map(event => {
            const selected = eventRates[event.id] !== undefined;
            return <li key={event.id} className={`min-w-0 rounded-xl border p-4 ${selected ? "border-[#b6c6a9] bg-[#f5f8ef]" : "border-[#e3e7dc] bg-white"}`}>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3"><span className="min-w-0"><span className="block break-words text-sm font-semibold text-[#3e5736]">{event.title}</span><span className="mt-1 block text-xs text-[#7e896f]">{dateLabel(event.startsAt)}</span></span><span className="relative inline-flex shrink-0"><input type="checkbox" role="switch" aria-label={`Associa a ${event.title}`} checked={selected} onChange={change => toggleEvent(event.id, change.target.checked)} className="peer sr-only" /><span aria-hidden="true" className="h-7 w-12 rounded-full bg-[#d6dbd0] transition-colors peer-checked:bg-[#36533e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#36533e]" /><span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" /></span></label>
              {selected && <div className="mt-3 max-w-sm border-t border-[#e0e8d8] pt-3"><AffiliateCommissionInput id={`${id}-rate-${event.id}`} value={eventRates[event.id]} onChange={value => setEventRates(current => ({ ...current, [event.id]: value }))} context={event.title} disabled={pending} invalid={error?.field === `rate-${event.id}`} errorId={`${id}-error`} /></div>}
            </li>;
          })}</ul> : <p className="rounded-xl bg-[#f5f7f1] p-4 text-sm leading-6 text-[#78856b]">{query ? "Nessun evento corrisponde alla ricerca." : "Non ci sono eventi disponibili. Puoi associare l’affiliato in seguito dalla gestione di un evento."}</p>}
          {selectedEvents.length === 0 && <p className="text-xs leading-5 text-[#78856b]">Puoi continuare senza eventi e abilitarli in seguito.</p>}
          {affiliate && <p className="text-xs leading-5 text-[#78856b]">Il compenso di un evento si applica anche agli iscritti validi già presenti. Deselezionare l’evento disabilita i nuovi acquisti tramite questo affiliato e conserva le iscrizioni precedenti.</p>}
        </>}
        {step === 3 && <>
          <div className="grid gap-4 sm:grid-cols-2"><section aria-label="Riepilogo dati" className="rounded-xl bg-[#f5f7f0] p-4"><h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#6d7c5d]"><CheckCircle2 size={16} aria-hidden="true" />Dati</h4><dl className="mt-3 space-y-2 text-sm"><div><dt className="sr-only">Nome pubblico</dt><dd className="break-words font-semibold text-[#344d38]">{draft.name}</dd></div>{draft.contactName && <div><dt className="text-xs text-[#7b876e]">Referente</dt><dd className="break-words text-[#51664a]">{draft.contactName}</dd></div>}{draft.email && <div><dt className="text-xs text-[#7b876e]">Email</dt><dd className="break-all text-[#51664a]">{draft.email}</dd></div>}{draft.phone && <div><dt className="text-xs text-[#7b876e]">Telefono</dt><dd className="break-words text-[#51664a]">{draft.phone}</dd></div>}{draft.notes && <div><dt className="text-xs text-[#7b876e]">Note interne</dt><dd className="whitespace-pre-wrap break-words text-[#51664a]">{draft.notes}</dd></div>}</dl><button type="button" onClick={() => goTo(0)} className="mt-3 min-h-10 text-xs font-semibold text-[#5e744c] underline underline-offset-4">Modifica dati</button></section><section aria-label="Riepilogo compenso" className="rounded-xl bg-[#f5f7f0] p-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-[#6d7c5d]">Compenso predefinito</h4><p className="mt-3 text-2xl font-semibold tabular-nums text-[#344d38]">{formatAffiliateCommission(parseAffiliateCommissionDraft(defaultRate)!)}</p><p className="mt-1 text-xs leading-5 text-[#7b876e]">Per ogni iscritto valido, nelle nuove associazioni.</p><button type="button" onClick={() => goTo(1)} className="mt-3 min-h-10 text-xs font-semibold text-[#5e744c] underline underline-offset-4">Modifica compenso</button></section></div>
          <section aria-label="Riepilogo eventi" className="rounded-xl border border-[#e1e7d8] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold uppercase tracking-wider text-[#6d7c5d]">Eventi associati</h4><button type="button" onClick={() => goTo(2)} className="min-h-10 text-xs font-semibold text-[#5e744c] underline underline-offset-4">Modifica eventi</button></div>{selectedEvents.length ? <ul className="mt-2 divide-y divide-[#e5eadf]">{selectedEvents.map(event => <li key={event.id} className="flex min-w-0 flex-wrap justify-between gap-2 py-3 text-sm"><span className="min-w-0 break-words text-[#4e6446]">{event.title}<span className="mt-1 block text-xs text-[#829074]">{dateLabel(event.startsAt)}</span></span><span className="font-semibold tabular-nums text-[#344d38]">{formatAffiliateCommission(parseAffiliateCommissionDraft(eventRates[event.id])!)} / iscritto</span></li>)}</ul> : <p className="mt-2 text-sm text-[#78856b]">Nessun evento selezionato. L’affiliato sarà disponibile nell’anagrafica.</p>}</section><p className="text-xs leading-5 text-[#78856b]">Il compenso maturato conta ogni iscritto valido una volta per evento. Pagamenti in attesa, rimborsi e annullamenti sono esclusi.</p>
        </>}
        {error && <p id={`${id}-error`} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{error.text}</p>}
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={step === 0 ? onCancel : () => goTo(step - 1)} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d8e0ce] bg-white px-4 text-sm font-semibold text-[#617451] disabled:opacity-60">{step > 0 && <ArrowLeft size={15} aria-hidden="true" />}{step === 0 ? "Annulla" : "Indietro"}</button><button type="submit" disabled={pending} className={primaryClass}>{pending ? "Salvataggio…" : step === 3 ? affiliate ? "Salva modifiche" : "Crea affiliato" : "Avanti"}{step === 3 ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}</button></footer>
    </form>
  </section>;
}
