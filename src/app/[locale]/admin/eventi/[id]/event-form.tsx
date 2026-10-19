"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { DateTimeField } from "@/components/admin/date-time-field";
import { WizardSteps } from "@/components/admin/wizard-steps";
import { upsertEvent, deleteEvent } from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";
import { Link } from "@/i18n/routing";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import type { Database } from "@/types/supabase";

type EventRow = Database["public"]["Tables"]["events"]["Row"] & { commerce_config?: unknown };
type LocalizedValue = string | Record<string, string>;

const eventSteps = [
  { title: "Dettagli", description: "Titolo e descrizione" },
  { title: "Data e luogo", description: "Orari, check-in e capienza" },
  { title: "Biglietteria e media", description: "Vendita e copertina" },
  { title: "Riepilogo", description: "Controlla e conferma" },
] as const;
const languageNames = { it: "Italiano", en: "Inglese", de: "Tedesco", es: "Spagnolo" };
function localizedCopy(value: unknown, language = "it") {
  if (typeof value === "string") return language === "it" ? value : "";
  const text = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[language] : "";
  return typeof text === "string" ? text : "";
}
function summaryDate(value: string) {
  const [date, time] = value.split("T");
  return date && time ? `${date.split("-").reverse().join("/")} · ${time}` : "Non specificata";
}

interface EventFormProps {
  initialData: EventRow | null;
  locale?: string;
  initialTicketingMode?: "single" | "advanced";
}

export function EventForm({ initialData, locale = "it", initialTicketingMode }: EventFormProps) {
  const router = useRouter();
  const dateFieldId = useId();
  const [currentStep, setCurrentStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const panels = useRef<(HTMLFieldSetElement | null)[]>([]);
  const progress = useRef<HTMLDivElement>(null);
  const previousStep = useRef(0);
  const saving = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const { showConfirm } = useModal();
  const initialCommerceConfig = parseCommerceConfig(initialData?.commerce_config);
  const [ticketingMode, setTicketingMode] = useState<"single" | "advanced">(initialCommerceConfig || initialTicketingMode === "advanced" ? "advanced" : "single");
  const requiresTicketSetup = ticketingMode === "advanced" && !initialCommerceConfig?.enabled;

  // Convert cents to euros for the UI
  const initialPriceEuro = initialData?.prezzo_cents !== null && initialData?.prezzo_cents !== undefined
    ? new Intl.NumberFormat("it-IT", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(initialData.prezzo_cents / 100)
    : "";

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    titolo: initialData?.titolo || "",
    sottotitolo: initialData?.sottotitolo || "",
    slug: initialData?.slug || "",
    tipo: initialData?.tipo || "evento",
    descrizione: initialData?.descrizione || "",
    data_inizio: initialData?.data_inizio ? toRomeInput(initialData.data_inizio) : "",
    data_fine: initialData?.data_fine ? toRomeInput(initialData.data_fine) : "",
    check_in_starts_at: initialData?.check_in_starts_at ? toRomeInput(initialData.check_in_starts_at) : "",
    location: initialData?.location || "",
    indirizzo: initialData?.indirizzo || "",
    prezzo_euro: initialPriceEuro,
    capacity: initialData?.capacity ?? "",
    copertina_url: initialData?.copertina_url || "",
    attivo: initialData?.attivo ?? true,
  });

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleTitoloChange = (value: LocalizedValue) => {
    const itTitolo = typeof value === 'object' ? (value.it || "") : (typeof value === 'string' ? value : "");
    setFormData(prev => ({
      ...prev,
      titolo: value,
      slug: prev.id === "nuovo" ? generateSlug(itTitolo) : prev.slug
    }));
  };

  const eventDates = () => {
    // Keep the stored instant when its wall time did not change, including the
    // seconds and the known offset during the repeated autumn hour.
    const startsAt = initialData?.data_inizio && formData.data_inizio === toRomeInput(initialData.data_inizio)
      ? initialData.data_inizio : fromRomeInput(formData.data_inizio);
    const endsAt = initialData?.data_fine && formData.data_fine === toRomeInput(initialData.data_fine)
      ? initialData.data_fine : fromRomeInput(formData.data_fine);
    const checkInStartsAt = initialData?.check_in_starts_at && formData.check_in_starts_at === toRomeInput(initialData.check_in_starts_at)
      ? initialData.check_in_starts_at : fromRomeInput(formData.check_in_starts_at);
    if (!startsAt) throw new Error("Inserisci la data e l’orario di inizio dell’evento.");
    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw new Error("La fine dell’evento non può precedere l’inizio.");
    if (checkInStartsAt && Date.parse(checkInStartsAt) > Date.parse(startsAt)) throw new Error("L’apertura del check-in non può essere successiva all’inizio dell’evento.");
    return { startsAt, endsAt, checkInStartsAt };
  };

  const ticketPrice = () => {
    if (ticketingMode === "advanced") return initialData?.prezzo_cents ?? null;
    if (!formData.prezzo_euro.trim()) return null;
    const value = Number(formData.prezzo_euro.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100_000) throw new Error("Il prezzo deve essere un numero valido, positivo o zero, fino a 100.000 €. Lascia vuoto per un evento gratuito.");
    return Math.round(value * 100);
  };

  const validateStep = (step: number) => {
    try {
      if (step === 0) {
        if (!localizedCopy(formData.titolo).trim()) throw new Error("Inserisci il titolo in italiano.");
        if (!formData.slug.trim()) throw new Error("Inserisci lo slug dell’evento.");
      }
      if (step === 1) {
        eventDates();
        if (formData.capacity !== "" && (!Number.isInteger(Number(formData.capacity)) || Number(formData.capacity) < 0 || Number(formData.capacity) > 100_000)) throw new Error("La capienza deve essere un numero intero tra 0 e 100.000, oppure vuota per posti illimitati.");
      }
      if (step === 2) ticketPrice();
      // Inactive panels stay mounted and enabled. This checks their local
      // incomplete drafts too, without native validation on hidden steps.
      const controls = panels.current[step]?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea");
      if (controls && [...controls].some((control) => !control.checkValidity())) throw new Error("Controlla i campi di questo passaggio prima di continuare.");
      return true;
    } catch (error) {
      setCurrentStep(step);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Controlla i dati inseriti." });
      return false;
    }
  };

  useEffect(() => {
    if (previousStep.current === currentStep) return;
    previousStep.current = currentStep;
    progress.current?.focus({ preventScroll: true });
    progress.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [currentStep]);

  useEffect(() => {
    if (message?.type !== "error") return;
    const panel = panels.current[currentStep];
    if (currentStep === 0 && message.text === "Inserisci il titolo in italiano.") {
      const title = panel?.querySelector<HTMLElement>("[data-event-title]");
      [...(title?.querySelectorAll("button") || [])].find((button) => button.textContent === "it")?.click();
      title?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    const controls = panel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea");
    const invalid = controls && [...controls].find((control) => !control.checkValidity());
    const target = invalid || panel?.querySelector<HTMLElement>("input,textarea,button");
    target?.focus();
    invalid?.reportValidity();
  }, [currentStep, message]);

  const changeStep = (next: number) => {
    if (isPending || saving.current || next < 0 || next > maxStep || next === currentStep) return;
    if (next > currentStep) for (let step = currentStep; step < next; step += 1) if (!validateStep(step)) return;
    setMessage(null);
    setCurrentStep(next);
  };

  const advanceStep = () => {
    if (isPending || saving.current || currentStep >= 3) return;
    setMessage(null);
    if (!validateStep(currentStep)) return;
    const next = currentStep + 1;
    setMaxStep((previous) => Math.max(previous, next));
    setCurrentStep(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || saving.current) return;
    if (currentStep < 3) { advanceStep(); return; }
    setMessage(null);
    // Review is the only step allowed to save. Recheck every panel in case an
    // organizer returned to an earlier step and changed a completed field.
    for (let step = 0; step < 3; step += 1) if (!validateStep(step)) return;
    const { startsAt, endsAt, checkInStartsAt } = eventDates();
    const payload = {
      id: formData.id === "nuovo" ? undefined : formData.id,
      titolo: formData.titolo, sottotitolo: formData.sottotitolo,
      slug: formData.slug, tipo: formData.tipo, descrizione: formData.descrizione,
      data_inizio: startsAt, data_fine: endsAt, check_in_starts_at: checkInStartsAt,
      location: formData.location, indirizzo: formData.indirizzo,
      prezzo_cents: ticketPrice(),
      capacity: formData.capacity === "" ? null : Number(formData.capacity),
      copertina_url: formData.copertina_url,
      attivo: requiresTicketSetup ? false : formData.attivo,
      ticketing_mode: ticketingMode,
    };
    saving.current = true;
    startTransition(async () => {
      try {
        const result = await upsertEvent(payload);
        if (result.error) setMessage({ type: "error", text: result.error });
        else {
          setMessage({ type: "success", text: "Evento salvato con successo!" });
          if (ticketingMode === "advanced") router.push(`/${locale}/admin/eventi/${result.id}/commerce`);
          else if (formData.id === "nuovo") router.push(`/${locale}/admin/eventi/${result.id}`);
        }
      } catch {
        setMessage({ type: "error", text: "Salvataggio interrotto. Controlla la connessione e riprova." });
      } finally { saving.current = false; }
    });
  };

  const handleDelete = async () => {
    if (isPending || saving.current) return;
    const isConfirmed = await showConfirm({
      title: "Elimina Evento",
      message: "Sei sicuro di voler eliminare questo evento? Se ha dei biglietti venduti, l'operazione non sarà consentita. Considera di disattivarlo invece."
    });
    
    if (!isConfirmed) return;
    
    startTransition(async () => {
      const result = await deleteEvent(formData.id);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        router.push(`/${locale}/admin/eventi`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      if (currentStep < 3 && event.key === "Enter" && !event.defaultPrevented && !event.nativeEvent.isComposing && target.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((target as HTMLInputElement).type)) {
        event.preventDefault();
        advanceStep();
      }
    }} noValidate className="max-w-4xl space-y-6 pb-6">
      <div ref={progress} tabIndex={-1} data-wizard-progress className="scroll-mt-40 space-y-4 outline-none md:scroll-mt-24">
        <WizardSteps steps={eventSteps} currentStep={currentStep} onStepChange={changeStep} maxStep={maxStep} disabled={isPending} label={formData.id === "nuovo" ? "Creazione evento" : "Modifica evento"} />
        <p aria-live="polite" className="text-sm text-[#7a8272]">Passaggio {currentStep + 1} di 4 · {eventSteps[currentStep].title}</p>
      </div>
      {message && (
        <div role={message.type === 'error' ? "alert" : "status"} className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <fieldset ref={(node) => { panels.current[0] = node; }} hidden={currentStep !== 0} disabled={isPending} data-event-step="0" aria-label={eventSteps[0].title} className="min-w-0 border-0 p-0">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-center border-b border-border pb-2">
          <h2 className="text-xl font-bold">Dati Principali</h2>
          {formData.id !== "nuovo" && (
            <button 
              type="button" 
              onClick={handleDelete}
              className="text-sm font-semibold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Elimina Evento
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div data-event-title><MultilingualInput
            label="Titolo *"
            value={formData.titolo} 
            onChange={handleTitoloChange} 
            aria-describedby={`${dateFieldId}-title-help`}
          /><p id={`${dateFieldId}-title-help`} className="mt-2 text-xs leading-5 text-muted-foreground">Il titolo in italiano è obbligatorio. Le traduzioni nelle altre lingue sono facoltative.</p></div>
          <MultilingualInput 
            label="Sottotitolo" 
            value={formData.sottotitolo} 
            onChange={val => setFormData({...formData, sottotitolo: val})} 
          />
          <Input 
            label="Slug (URL) *" 
            required 
            value={formData.slug} 
            onChange={e => setFormData({...formData, slug: e.target.value})} 
          />
          <Select 
            label="Tipo Evento *" 
            required
            options={[
              { value: "evento", label: "Evento Standard" },
              { value: "masterclass", label: "Masterclass" },
              { value: "workshop", label: "Workshop" }
            ]}
            value={formData.tipo}
            onChange={e => setFormData({...formData, tipo: e.target.value as EventRow["tipo"]})}
          />
        </div>

        <MultilingualTextarea 
          label="Descrizione Completa" 
          className="min-h-[150px]"
          value={formData.descrizione} 
          onChange={val => setFormData({...formData, descrizione: val})} 
        />
      </div>

      </fieldset>
      <fieldset ref={(node) => { panels.current[1] = node; }} hidden={currentStep !== 1} disabled={isPending} data-event-step="1" aria-label={eventSteps[1].title} className="min-w-0 border-0 p-0">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Data e luogo</h2>
        <p className="text-sm text-muted-foreground">Gli orari sono riferiti all’Italia (Europe/Rome).</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DateTimeField id={`${dateFieldId}-start`} label="Inizio Evento" required value={formData.data_inizio} onChange={value => setFormData({...formData, data_inizio: value})} />
          <DateTimeField id={`${dateFieldId}-end`} label="Fine Evento" value={formData.data_fine} onChange={value => setFormData({...formData, data_fine: value})} />
          <DateTimeField id={`${dateFieldId}-check-in`} label="Apertura check-in" value={formData.check_in_starts_at} max={formData.data_inizio || undefined} onChange={value => setFormData({...formData, check_in_starts_at: value})} description="Facoltativa, in orario italiano (Europe/Rome). Può essere anche il giorno prima; lascia vuoto se non è ancora definita." />
          <Input 
            label="Location (es. Meraki HQ)" 
            value={formData.location} 
            onChange={e => setFormData({...formData, location: e.target.value})} 
          />
          <Input 
            label="Indirizzo Esteso" 
            value={formData.indirizzo} 
            onChange={e => setFormData({...formData, indirizzo: e.target.value})} 
          />
          <Input 
            label="Posti Totali (Capienza)" 
            type="number"
            min={0}
            max={100000}
            placeholder="es. 50 (vuoto = illimitati)"
            value={formData.capacity} 
            onChange={e => setFormData({...formData, capacity: e.target.value})} 
          />
        </div>
      </div>

      </fieldset>
      <fieldset ref={(node) => { panels.current[2] = node; }} hidden={currentStep !== 2} disabled={isPending} data-event-step="2" aria-label={eventSteps[2].title} className="min-w-0 space-y-6 border-0 p-0">
      <fieldset className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <legend className="px-2 text-xl font-bold">Come vuoi vendere i biglietti?</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${ticketingMode === "single" ? "border-indigo-500 bg-indigo-50" : "border-border"}`}>
            <input type="radio" name="ticketing-mode" value="single" checked={ticketingMode === "single"} disabled={Boolean(initialCommerceConfig?.enabled)} onChange={() => setTicketingMode("single")} className="mt-1 h-4 w-4 shrink-0" />
            <span><strong className="block text-sm">Prezzo unico</strong><span className="mt-1 block text-sm text-slate-600">Un biglietto per l’evento, con un solo prezzo oppure gratuito.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${ticketingMode === "advanced" ? "border-indigo-500 bg-indigo-50" : "border-border"}`}>
            <input type="radio" name="ticketing-mode" value="advanced" checked={ticketingMode === "advanced"} onChange={() => setTicketingMode("advanced")} className="mt-1 h-4 w-4 shrink-0" />
            <span><strong className="block text-sm">Formule, scaglioni e cena</strong><span className="mt-1 block text-sm text-slate-600">Solo Workshop, solo Masterclass, WS + MC, prezzi Early Bird e cena facoltativa.</span></span>
          </label>
        </div>
        {ticketingMode === "single" ? <Input label="Prezzo del biglietto (€)" inputMode="decimal" lang="it-IT" placeholder="Lascia vuoto se gratuito. Es. 20,00" value={formData.prezzo_euro} onChange={e => setFormData({ ...formData, prezzo_euro: e.target.value })} /> : <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <p><strong className="text-slate-900">1. Crea la bozza → 2. Configura i biglietti → 3. Pubblica.</strong></p>
          <p>Nel prossimo passaggio imposti attività, formule, prezzi con date di validità e cena. Ogni partecipante riceverà il proprio QR via email.</p>
          {requiresTicketSetup && <p>L’evento resta non pubblicato finché non completi le formule e premi “Salva e pubblica evento”.</p>}
          {formData.id !== "nuovo" && <Link href={`/admin/eventi/${formData.id}/commerce`} className="inline-flex min-h-11 items-center font-semibold text-indigo-700">Apri Formule e prezzi →</Link>}
          {initialCommerceConfig?.enabled && <p>Le formule sono già attive: i prezzi si modificano in “Formule e prezzi”. Il prezzo unico precedente viene conservato.</p>}
        </div>}
      </fieldset>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Immagine di copertina</h2>
        
        <Input 
          label="URL Immagine di Copertina" 
          placeholder="https://..."
          value={formData.copertina_url} 
          onChange={e => setFormData({...formData, copertina_url: e.target.value})} 
        />
        {formData.copertina_url && (
          <div className="mt-2 w-full max-w-sm rounded-lg overflow-hidden border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.copertina_url} alt="Anteprima" className="w-full h-auto object-contain aspect-video" />
          </div>
        )}

      </div>
      </fieldset>

      <fieldset ref={(node) => { panels.current[3] = node; }} hidden={currentStep !== 3} disabled={isPending} data-event-step="3" aria-label={eventSteps[3].title} className="min-w-0 space-y-6 rounded-2xl border border-[#dedfd4] bg-[#fffefa] p-5 sm:p-6">
        <div><h2 className="text-xl font-semibold text-[#18251f]">Controlla prima di confermare</h2><p className="mt-2 text-sm leading-6 text-[#7a8272]">I dati vengono salvati solo con il pulsante finale. Puoi tornare ai passaggi precedenti per modificarli.</p></div>
        <section className="space-y-3" aria-label="Riepilogo dettagli"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Dettagli</h3><button type="button" onClick={() => changeStep(0)} className="min-h-11 text-sm font-semibold text-[#8f794f]">Modifica dettagli</button></div>
          <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(languageNames).map(([language, name]) => <div key={language} className="rounded-xl bg-[#f3f2ed] p-3"><dt className="text-xs text-[#7a8272]">{name}</dt><dd className="mt-1 break-words text-sm font-semibold">{localizedCopy(formData.titolo, language) || "Titolo non inserito"}</dd>{localizedCopy(formData.sottotitolo, language) && <dd className="mt-1 text-sm text-[#7a8272]">{localizedCopy(formData.sottotitolo, language)}</dd>}</div>)}</dl>
          <details className="rounded-xl border border-[#e4e5dc] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#52604f]">Rivedi le descrizioni</summary><div className="mt-3 space-y-4">{Object.entries(languageNames).map(([language, name]) => <div key={language}><h4 className="text-xs font-semibold text-[#7a8272]">{name}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{localizedCopy(formData.descrizione, language).replace(/<[^>]*>/g, " ").trim() || "Descrizione non inserita"}</p></div>)}</div></details>
          <p className="break-all text-xs text-[#7a8272]">{formData.tipo === "evento" ? "/eventi/" : "/workshop/"}{formData.slug}</p>
        </section>
        <section className="space-y-3 border-t border-[#e4e5dc] pt-4" aria-label="Riepilogo data e luogo"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Data e luogo</h3><button type="button" onClick={() => changeStep(1)} className="min-h-11 text-sm font-semibold text-[#8f794f]">Modifica data e luogo</button></div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">{[["Inizio evento", summaryDate(formData.data_inizio)], ["Fine evento", summaryDate(formData.data_fine)], ["Apertura check-in", summaryDate(formData.check_in_starts_at)], ["Luogo", [formData.location, formData.indirizzo].filter(Boolean).join(" · ") || "Non specificato"], ["Capienza", formData.capacity === "" ? "Illimitata" : `${formData.capacity} posti`]].map(([label, value]) => <div key={label}><dt className="text-xs text-[#7a8272]">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
          <p className="text-xs text-[#7a8272]">Tutti gli orari sono in orario italiano (Europe/Rome).</p>
        </section>
        <section className="space-y-3 border-t border-[#e4e5dc] pt-4" aria-label="Riepilogo biglietteria"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Biglietteria e media</h3><button type="button" onClick={() => changeStep(2)} className="min-h-11 text-sm font-semibold text-[#8f794f]">Modifica biglietteria e media</button></div>
          <p className="text-sm">{ticketingMode === "advanced" ? "Formule, scaglioni e cena" : formData.prezzo_euro && Number(formData.prezzo_euro.replace(",", ".")) > 0 ? `Prezzo unico · ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(formData.prezzo_euro.replace(",", ".")))}` : "Prezzo unico · Gratuito"}</p>
          <p className="text-sm text-[#7a8272]">{formData.copertina_url ? "Immagine di copertina inserita." : "Nessuna immagine di copertina."}</p>
          {requiresTicketSetup && <p className="rounded-xl bg-[#f2efe6] p-4 text-sm leading-6">Alla conferma salvi una bozza e apri la configurazione di attività, formule e prezzi. Pubblicherai l’evento dopo aver completato la biglietteria.</p>}
        </section>
        <div className="pt-4">
          <Checkbox 
            label="Pubblica sul sito" 
            description={requiresTicketSetup ? "La pubblicazione sarà disponibile dopo la configurazione delle formule." : "Se disattivato, l’evento resta non pubblicato e gli acquisti non sono disponibili."}
            checked={requiresTicketSetup ? false : formData.attivo}
            disabled={requiresTicketSetup}
            onChange={e => setFormData({...formData, attivo: e.target.checked})}
          />
        </div>
      </fieldset>

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-2xl border border-[#dedfd4] bg-[#f8f7f2]/95 p-3 shadow-sm backdrop-blur sm:p-4">
        <button type="button" disabled={isPending || currentStep === 0} onClick={() => changeStep(currentStep - 1)} className="min-h-12 rounded-xl border border-[#d9ddcf] px-4 text-sm font-semibold text-[#52604f] disabled:opacity-40">Indietro</button>
        {currentStep < 3 ? <button key="event-next" type="button" data-event-advance disabled={isPending} onClick={(event) => { event.preventDefault(); advanceStep(); }} className="min-h-12 rounded-xl bg-[#263a2c] px-5 text-sm font-semibold text-white disabled:opacity-50 sm:px-7">Avanti</button>
          : <button key="event-confirm" type="submit" data-event-confirm disabled={isPending} className="min-h-12 rounded-xl bg-[#263a2c] px-5 text-sm font-semibold text-white disabled:opacity-50 sm:px-7">
            {isPending ? "Salvataggio…" : ticketingMode === "advanced" ? (formData.id === "nuovo" ? "Crea bozza e configura biglietti" : "Salva e configura biglietti") : (formData.id === "nuovo" ? "Crea evento" : "Salva modifiche")}
          </button>}
      </div>
    </form>
  );
}
