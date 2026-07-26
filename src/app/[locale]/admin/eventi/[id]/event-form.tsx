"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { upsertEvent, deleteEvent, sendEventCommunicationToAttendees } from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { ArrowLeft, ArrowRight, Bell, CalendarClock, Check, HelpCircle, ImageUp, Loader2, MailWarning, PartyPopper } from "lucide-react";
import { toast } from "sonner";

interface EventFormProps {
  initialData: any;
}

export function EventForm({ initialData }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const { showConfirm } = useModal();

  // Convert cents to euros for the UI
  const initialPriceEuro = initialData?.prezzo_cents 
    ? (initialData.prezzo_cents / 100).toFixed(2) 
    : "";

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    titolo: initialData?.titolo || "",
    sottotitolo: initialData?.sottotitolo || "",
    slug: initialData?.slug || "",
    tipo: initialData?.tipo || "evento",
    descrizione: initialData?.descrizione || "",
    data_inizio: toLocalDateTimeInput(initialData?.data_inizio),
    data_fine: toLocalDateTimeInput(initialData?.data_fine),
    location: initialData?.location || "",
    indirizzo: initialData?.indirizzo || "",
    prezzo_euro: initialPriceEuro,
    capacity: initialData?.capacity || "",
    copertina_url: initialData?.copertina_url || "",
    attivo: initialData?.attivo ?? true,
    in_evidenza: initialData?.in_evidenza ?? false,
    cta_tipo: initialData?.cta_tipo || "stripe",
    cta_url: initialData?.cta_url || "",
    meta_title: initialData?.meta_title || "",
    meta_description: initialData?.meta_description || "",
  });

  const steps = [
    { id: 1, title: "Identità", description: "Tipo, nome e descrizione" },
    { id: 2, title: "Quando e dove", description: "Data, ora e luogo" },
    { id: 3, title: "Iscrizioni", description: "Prezzo, posti e modalità" },
    { id: 4, title: "Pubblicazione", description: "Immagine, SEO e visibilità" },
  ];

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleTitoloChange = (value: any) => {
    const itTitolo = typeof value === 'object' ? (value.it || "") : (typeof value === 'string' ? value : "");
    setFormData(prev => ({
      ...prev,
      titolo: value,
      slug: prev.id === "nuovo" ? generateSlug(itTitolo) : prev.slug
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Parse euro to cents
    let prezzo_cents = null;
    if (formData.prezzo_euro) {
      const parsedEuro = parseFloat(formData.prezzo_euro.replace(',', '.'));
      if (isNaN(parsedEuro)) {
        setMessage({ type: 'error', text: "Il prezzo deve essere un numero valido o vuoto (per eventi gratuiti)." });
        return;
      }
      prezzo_cents = Math.round(parsedEuro * 100);
    }

    const payload = {
      id: formData.id === "nuovo" ? undefined : formData.id,
      titolo: formData.titolo,
      sottotitolo: formData.sottotitolo,
      slug: formData.slug,
      tipo: formData.tipo,
      descrizione: formData.descrizione,
      data_inizio: new Date(formData.data_inizio).toISOString(),
      data_fine: formData.data_fine ? new Date(formData.data_fine).toISOString() : null,
      location: formData.location,
      indirizzo: formData.indirizzo,
      prezzo_cents,
      capacity: formData.capacity ? parseInt(formData.capacity as string) : null,
      copertina_url: formData.copertina_url,
      attivo: formData.attivo,
      in_evidenza: formData.in_evidenza,
      cta_tipo: formData.cta_tipo,
      cta_url: formData.cta_url || null,
      meta_title: formData.meta_title || null,
      meta_description: formData.meta_description || null,
    };

    startTransition(async () => {
      const result = await upsertEvent(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Evento salvato con successo!' });
        if (formData.id === "nuovo") {
          router.push(`/admin/eventi/${result.id}`);
        }
      }
    });
  };

  const italianTitle = typeof formData.titolo === "object" ? formData.titolo.it : formData.titolo;
  const goToStep = (nextStep: number) => {
    if (nextStep > currentStep) {
      if (currentStep === 1 && (!italianTitle?.trim() || !formData.slug.trim())) {
        toast.error("Inserisci almeno il titolo italiano. L’indirizzo web viene creato automaticamente.");
        return;
      }
      if (currentStep === 2) {
        if (!formData.data_inizio) {
          toast.error("Scegli data e ora di inizio.");
          return;
        }
        const start = new Date(formData.data_inizio);
        const end = formData.data_fine ? new Date(formData.data_fine) : null;
        if (end && end <= start) {
          toast.error("La fine deve essere successiva all’inizio.");
          return;
        }
        if (formData.id === "nuovo" && start.getTime() < Date.now()) {
          toast.error("La data scelta è già passata. Scegli una data futura per pubblicare l’evento.");
          return;
        }
      }
      if (currentStep === 3 && formData.cta_tipo === "external_url" && !formData.cta_url.trim()) {
        toast.error("Inserisci il link esterno per le iscrizioni.");
        return;
      }
    }
    setCurrentStep(Math.max(1, Math.min(4, nextStep)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const Help = ({ text }: { text: string }) => (
    <span className="group relative inline-flex align-middle">
      <HelpCircle className="size-4 cursor-help text-slate-400" aria-label={text} />
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 -translate-x-1/2 rounded-lg bg-slate-950 p-2.5 text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );

  const handleDelete = async () => {
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
        router.push("/admin/eventi");
      }
    });
  };

  const handleCoverUpload = async (file?: File) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const compressed = await compressImageToWebp(file, 1920, 0.88);
      const uploadData = new FormData();
      uploadData.append("file", compressed);
      uploadData.append("folder", "events");
      const result = await uploadImageAction(uploadData);
      if (!result.success || !result.url) throw new Error(result.error || "Upload non riuscito");
      setFormData(current => ({ ...current, copertina_url: result.url! }));
      toast.success("Copertina caricata");
    } catch (error) {
      toast.error("Caricamento non riuscito", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCommunication = async (
    type: "reminder" | "update" | "cancelled" | "thank_you",
    label: string,
  ) => {
    const isConfirmed = await showConfirm({
      title: label,
      message: type === "thank_you"
        ? "L’email sarà inviata solo alle persone entrate tramite check-in. Vuoi continuare?"
        : `L’email sarà inviata a tutti i partecipanti validi dell’evento. Vuoi inviare “${label}”?`,
    });
    if (!isConfirmed) return;
    startTransition(async () => {
      const result = await sendEventCommunicationToAttendees(formData.id, type);
      if (result.error) {
        toast.error(result.error);
      } else if (result.failed) {
        toast.warning(`Inviate ${result.sent} email; ${result.failed} non riuscite.`);
      } else {
        toast.success(`${result.sent} email inviate`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6 pb-12">
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <nav aria-label="Avanzamento creazione evento" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {steps.map((step) => {
            const active = currentStep === step.id;
            const complete = currentStep > step.id;
            return (
              <button key={step.id} type="button" onClick={() => goToStep(step.id)} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition ${active ? "border-indigo-500 bg-indigo-50" : complete ? "border-emerald-200 bg-emerald-50/60" : "border-transparent hover:bg-slate-50"}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-indigo-600 text-white" : complete ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {complete ? <Check className="size-4" /> : step.id}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-slate-900">{step.title}</strong>
                  <span className="hidden truncate text-xs text-slate-500 sm:block">{step.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className={`${currentStep === 1 ? "block" : "hidden"} space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6`}>
        <div className="flex flex-col items-stretch gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Passaggio 1 di 4</p>
            <h2 className="mt-1 text-xl font-bold">Che tipo di evento stai creando?</h2>
            <p className="mt-1 text-sm text-slate-500">Parti dalle informazioni che le persone vedranno per prime.</p>
          </div>
          {formData.id !== "nuovo" && (
            <button 
              type="button" 
              onClick={handleDelete}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:text-red-700 sm:min-h-0 sm:py-1.5"
            >
              Elimina Evento
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MultilingualInput 
            label="Titolo *" 
            required 
            value={formData.titolo} 
            onChange={handleTitoloChange} 
          />
          <MultilingualInput 
            label="Sottotitolo" 
            value={formData.sottotitolo} 
            onChange={val => setFormData({...formData, sottotitolo: val})} 
          />
          <Input 
            label="Indirizzo web (generato automaticamente) *"
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
            onChange={e => setFormData({...formData, tipo: e.target.value})}
          />
        </div>

        <MultilingualTextarea 
          label="Descrizione Completa" 
          className="min-h-[150px]"
          value={formData.descrizione} 
          onChange={val => setFormData({...formData, descrizione: val})} 
        />
      </div>

      {formData.id !== "nuovo" && currentStep === 4 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-bold">Comunicazioni partecipanti</h2>
            <p className="mt-1 text-sm text-slate-500">
              Invia template Meraki già tradotti nella lingua scelta durante l’acquisto.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" disabled={isPending} onClick={() => handleCommunication("reminder", "Invia promemoria")} className="inline-flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50 disabled:opacity-50">
              <CalendarClock className="size-5 text-indigo-600" />
              <span><strong className="block text-sm">Promemoria</strong><span className="text-xs text-slate-500">Data, luogo e biglietto</span></span>
            </button>
            <button type="button" disabled={isPending} onClick={() => handleCommunication("update", "Invia aggiornamento")} className="inline-flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50 disabled:opacity-50">
              <Bell className="size-5 text-blue-600" />
              <span><strong className="block text-sm">Aggiornamento</strong><span className="text-xs text-slate-500">Comunica i nuovi dettagli</span></span>
            </button>
            <button type="button" disabled={isPending} onClick={() => handleCommunication("cancelled", "Comunica annullamento")} className="inline-flex items-center gap-3 rounded-xl border border-red-200 p-4 text-left hover:bg-red-50 disabled:opacity-50">
              <MailWarning className="size-5 text-red-600" />
              <span><strong className="block text-sm text-red-700">Annullamento</strong><span className="text-xs text-slate-500">Avvisa tutti i partecipanti</span></span>
            </button>
            <button type="button" disabled={isPending} onClick={() => handleCommunication("thank_you", "Invia ringraziamento")} className="inline-flex items-center gap-3 rounded-xl border border-emerald-200 p-4 text-left hover:bg-emerald-50 disabled:opacity-50">
              <PartyPopper className="size-5 text-emerald-600" />
              <span><strong className="block text-sm">Ringraziamento</strong><span className="text-xs text-slate-500">Solo partecipanti entrati</span></span>
            </button>
          </div>
        </div>
      )}

      <div className={`${currentStep === 2 ? "block" : "hidden"} space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6`}>
        <div className="border-b border-border pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Passaggio 2 di 4</p>
          <h2 className="mt-1 text-xl font-bold">Quando e dove si svolge?</h2>
          <p className="mt-1 text-sm text-slate-500">Gli orari vengono pubblicati nel fuso di Bolzano/Roma.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold">Inizio evento * <Help text="Scegli una data futura. Un evento concluso viene spostato automaticamente nell’archivio pubblico." /></label>
            <input 
              type="datetime-local" 
              required
              value={formData.data_inizio}
              onChange={e => setFormData({...formData, data_inizio: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
            />
          </div>
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold">Fine evento <Help text="Facoltativa. È utile per workshop, giornate intere e manifestazioni su più giorni." /></label>
            <input 
              type="datetime-local" 
              value={formData.data_fine}
              onChange={e => setFormData({...formData, data_fine: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
            />
          </div>
          <Input 
            label="Nome del luogo"
            placeholder="Es. Meraki Experience, Sala Grande"
            value={formData.location}
            onChange={e => setFormData({...formData, location: e.target.value})}
          />
          <Input 
            label="Indirizzo completo"
            placeholder="Via, numero civico, città"
            value={formData.indirizzo} 
            onChange={e => setFormData({...formData, indirizzo: e.target.value})} 
          />
        </div>
      </div>

      <div className={`${currentStep === 3 ? "block" : "hidden"} space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6`}>
        <div className="border-b border-border pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Passaggio 3 di 4</p>
          <h2 className="mt-1 text-xl font-bold">Come funzionano le iscrizioni?</h2>
          <p className="mt-1 text-sm text-slate-500">Scegli la modalità; mostreremo soltanto i campi necessari.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Select label="Modalità di partecipazione" value={formData.cta_tipo} onChange={e => setFormData({...formData, cta_tipo: e.target.value})} options={[
            { value: "stripe", label: "Iscrizione sul sito (consigliata)" },
            { value: "external_url", label: "Iscrizione su un sito esterno" },
            { value: "info_only", label: "Solo informazioni, senza iscrizione" },
          ]} />
          {formData.cta_tipo === "external_url" && (
            <Input label="Link esterno *" type="url" placeholder="https://..." value={formData.cta_url} onChange={e => setFormData({...formData, cta_url: e.target.value})} />
          )}
          {formData.cta_tipo === "stripe" && (
            <>
              <Input label="Prezzo (€)" inputMode="decimal" placeholder="0 oppure vuoto = gratuito" value={formData.prezzo_euro} onChange={e => setFormData({...formData, prezzo_euro: e.target.value})} />
              <Input label="Posti disponibili" type="number" min="1" placeholder="Vuoto = nessun limite" value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} />
            </>
          )}
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <strong>Come funziona:</strong> per un evento gratuito il sistema genera comunque un biglietto QR. Per un evento a pagamento, l’utente completa prima il pagamento Stripe.
        </div>
      </div>

      <div className={`${currentStep === 4 ? "block" : "hidden"} space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6`}>
        <div className="border-b border-border pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Passaggio 4 di 4</p>
          <h2 className="mt-1 text-xl font-bold">Anteprima e pubblicazione</h2>
          <p className="mt-1 text-sm text-slate-500">Completa l’aspetto e decidi quando rendere visibile l’evento.</p>
        </div>
        
        <div className="space-y-2">
          <label className="block text-sm font-semibold">Immagine di copertina</label>
          <div className="flex gap-2">
            <input
              value={formData.copertina_url}
              onChange={e => setFormData({...formData, copertina_url: e.target.value})}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="URL oppure carica un’immagine"
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
              {uploadingCover ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {uploadingCover ? "Caricamento…" : "Carica"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingCover} onChange={event => handleCoverUpload(event.target.files?.[0])} />
            </label>
          </div>
        </div>
        {formData.copertina_url && (
          <div className="mt-2 w-full max-w-sm rounded-lg overflow-hidden border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.copertina_url} alt="Anteprima" className="w-full h-auto object-contain aspect-video" />
          </div>
        )}

        <div className="pt-4">
          <div className="mb-3">
            <Checkbox label="Metti in evidenza" description="Segnala questo evento come contenuto prioritario." checked={formData.in_evidenza} onChange={e => setFormData({...formData, in_evidenza: e.target.checked})} />
          </div>
          <Checkbox 
            label="Pubblica sul sito" 
            description="Se disattivato, non sarà visibile e le prevendite non saranno attive."
            checked={formData.attivo}
            onChange={e => setFormData({...formData, attivo: e.target.checked})}
          />
        </div>

        <details className="rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Campi avanzati e SEO</summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">
            <Input label="Titolo per Google" placeholder={italianTitle || "Titolo evento"} value={formData.meta_title} onChange={e => setFormData({...formData, meta_title: e.target.value})} />
            <Input label="Descrizione per Google" placeholder="Breve descrizione, massimo 160 caratteri" maxLength={160} value={formData.meta_description} onChange={e => setFormData({...formData, meta_description: e.target.value})} />
          </div>
        </details>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:bottom-6 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => goToStep(currentStep - 1)} disabled={currentStep === 1 || isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-5 text-sm font-semibold disabled:opacity-40">
          <ArrowLeft className="size-4" /> Indietro
        </button>
        {currentStep < 4 ? (
          <button type="button" onClick={() => goToStep(currentStep + 1)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-6 text-sm font-semibold text-white">
            Continua <ArrowRight className="size-4" />
          </button>
        ) : (
          <button type="submit" disabled={isPending} className="min-h-11 rounded-lg bg-primary px-8 font-bold text-primary-foreground disabled:opacity-50">
            {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Pubblica evento" : "Salva modifiche")}
          </button>
        )}
      </div>
    </form>
  );
}
  const toLocalDateTimeInput = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };
