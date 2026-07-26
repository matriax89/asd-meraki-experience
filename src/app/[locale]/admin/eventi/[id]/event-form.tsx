"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import {
  cancelEventAndRefund,
  deleteEvent,
  duplicateEvent,
  exportEventAttendees,
  getEventCommunicationHistory,
  sendEventCommunicationToAttendees,
  upsertEvent,
} from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { ArrowLeft, ArrowRight, Bell, CalendarClock, Check, Copy, Download, Eye, HelpCircle, ImageUp, Loader2, PartyPopper, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { normalizeRegistrationFields, type RegistrationField } from "@/lib/events/registration-fields";

interface EventFormProps {
  initialData: any;
}

export function EventForm({ initialData }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [communicationHistory, setCommunicationHistory] = useState<any[]>([]);
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
    recurring: false,
    recurrence_frequency: "weekly",
    recurrence_interval: "1",
    recurrence_occurrences: "4",
    registration_fields: normalizeRegistrationFields(initialData?.registration_fields),
  });
  const draftKey = `meraki:event-draft:${initialData?.id || "new"}`;

  useEffect(() => {
    if (!initialData) {
      try {
        const saved = window.localStorage.getItem(draftKey);
        if (saved) {
          setFormData((current) => ({ ...current, ...JSON.parse(saved), id: "nuovo" }));
          toast.info("Bozza precedente ripristinata");
        }
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    setDraftReady(true);
  }, [draftKey, initialData]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(formData));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftReady, formData]);

  useEffect(() => {
    if (formData.id === "nuovo" || currentStep !== 4) return;
    getEventCommunicationHistory(formData.id).then((result) => setCommunicationHistory(result.data || []));
  }, [currentStep, formData.id]);

  const steps = [
    { id: 1, title: "Identità", description: "Tipo, nome e descrizione" },
    { id: 2, title: "Quando e dove", description: "Data, ora e luogo" },
    { id: 3, title: "Iscrizioni e campi", description: "Prezzo, posti e dati partecipanti" },
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
      recurrence: {
        enabled: formData.recurring,
        frequency: formData.recurrence_frequency,
        interval: parseInt(formData.recurrence_interval),
        occurrences: parseInt(formData.recurrence_occurrences),
      },
      registration_fields: formData.registration_fields,
    };

    startTransition(async () => {
      const result = await upsertEvent(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        window.localStorage.removeItem(draftKey);
        const seriesMessage = result.occurrencesCreated && result.occurrencesCreated > 1
          ? `Serie creata: ${result.occurrencesCreated} appuntamenti pubblicati.`
          : "Evento salvato con successo!";
        setMessage({ type: 'success', text: seriesMessage });
        toast.success(seriesMessage);
        if (formData.id === "nuovo") {
          router.push(`/admin/eventi/${result.id}`);
        }
      }
    });
  };

  const handleDuplicate = async () => {
    const confirmed = await showConfirm({
      title: "Duplica evento",
      message: "Verrà creata una copia non pubblicata, programmata una settimana dopo. Potrai controllarla prima di pubblicarla.",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await duplicateEvent(formData.id);
      if (result.error || !result.id) {
        toast.error(result.error || "Duplicazione non riuscita");
        return;
      }
      toast.success("Copia creata come bozza");
      router.push(`/admin/eventi/${result.id}`);
    });
  };

  const handleExport = () => {
    startTransition(async () => {
      const result = await exportEventAttendees(formData.id);
      if (result.error || !result.csv) {
        toast.error(result.error || "Esportazione non riuscita");
        return;
      }
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename || "partecipanti.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Elenco partecipanti esportato");
    });
  };

  const handleCancelAndRefund = async () => {
    const confirmed = await showConfirm({
      title: "Annulla evento e rimborsa",
      message: "L’evento verrà nascosto, tutti i pagamenti Stripe validi saranno rimborsati e i partecipanti riceveranno l’email di annullamento. Questa operazione non può essere annullata.",
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await cancelEventAndRefund(formData.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.failed) toast.warning(`${result.refunded} rimborsi completati, ${result.failed} da verificare manualmente.`);
      else toast.success(`Evento annullato: ${result.refunded} rimborsi e ${result.emailsSent} email.`);
      router.refresh();
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
        if ((formData.id === "nuovo" || formData.recurring) && start.getTime() < Date.now()) {
          toast.error(formData.recurring
            ? "Per creare una serie, sposta prima questo appuntamento a una data futura."
            : "La data scelta è già passata. Scegli una data futura per pubblicare l’evento.");
          return;
        }
        if (formData.recurring) {
          const interval = parseInt(formData.recurrence_interval);
          const occurrences = parseInt(formData.recurrence_occurrences);
          if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
            toast.error("L’intervallo deve essere compreso tra 1 e 12.");
            return;
          }
          if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 52) {
            toast.error("Scegli da 2 a 52 appuntamenti.");
            return;
          }
        }
      }
      if (currentStep === 3 && formData.cta_tipo === "external_url" && !formData.cta_url.trim()) {
        toast.error("Inserisci il link esterno per le iscrizioni.");
        return;
      }
      if (currentStep === 3) {
        const incompleteField = formData.registration_fields.find((field) =>
          !field.label.trim() || (field.type === "select" && (field.options || []).length < 2),
        );
        if (incompleteField) {
          toast.error(!incompleteField.label.trim()
            ? "Completa il nome di tutti i campi aggiuntivi."
            : `Inserisci almeno due opzioni per “${incompleteField.label}”.`);
          return;
        }
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

  const addRegistrationField = () => {
    if (formData.registration_fields.length >= 12) {
      toast.error("Puoi aggiungere al massimo 12 campi.");
      return;
    }
    setFormData({
      ...formData,
      registration_fields: [
        ...formData.registration_fields,
        { id: crypto.randomUUID(), label: "", type: "text", required: false },
      ],
    });
  };

  const updateRegistrationField = (id: string, patch: Partial<RegistrationField>) => {
    setFormData({
      ...formData,
      registration_fields: formData.registration_fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    });
  };

  const removeRegistrationField = (id: string) => {
    setFormData({
      ...formData,
      registration_fields: formData.registration_fields.filter((field) => field.id !== id),
    });
  };

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
      const history = await getEventCommunicationHistory(formData.id);
      setCommunicationHistory(history.data || []);
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
                  <strong className="flex items-center gap-1.5 truncate text-sm text-slate-900">
                    <span className="truncate">{step.title}</span>
                    {step.id === 3 && formData.registration_fields.length > 0 && (
                      <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                        {formData.registration_fields.length}
                      </span>
                    )}
                  </strong>
                  <span className="hidden truncate text-xs text-slate-500 sm:block">{step.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {initialData?.recurrence_series_id && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
          <strong>Evento ricorrente:</strong> questo è l’appuntamento {Number(initialData.recurrence_index || 0) + 1} della serie. Le modifiche effettuate qui riguardano soltanto questa data.
        </div>
      )}

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
            <button type="button" disabled={isPending} onClick={() => handleCommunication("thank_you", "Invia ringraziamento")} className="inline-flex items-center gap-3 rounded-xl border border-emerald-200 p-4 text-left hover:bg-emerald-50 disabled:opacity-50">
              <PartyPopper className="size-5 text-emerald-600" />
              <span><strong className="block text-sm">Ringraziamento</strong><span className="text-xs text-slate-500">Solo partecipanti entrati</span></span>
            </button>
          </div>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Storico recente</h3>
            {communicationHistory.length ? (
              <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {communicationHistory.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                    <span className="font-semibold capitalize text-slate-700">{entry.communication_type.replaceAll("_", " ")}</span>
                    <span className="text-slate-500">{new Date(entry.created_at).toLocaleString("it-IT")} · {entry.sent_count}/{entry.recipient_count} inviate{entry.failed_count ? ` · ${entry.failed_count} errori` : ""}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-slate-500">Nessuna comunicazione registrata.</p>}
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

        {!initialData?.recurrence_series_id && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Checkbox
              label={formData.id === "nuovo" ? "Questo evento si ripete" : "Crea una serie ricorrente da questo evento"}
              description={formData.id === "nuovo"
                ? "Crea automaticamente una serie di appuntamenti con gli stessi contenuti, disponibilità e modalità di iscrizione."
                : "Mantiene questo evento come prima data e crea automaticamente gli appuntamenti successivi."}
              checked={formData.recurring}
              onChange={(event) => setFormData({ ...formData, recurring: event.target.checked })}
            />
            {formData.recurring && (
              <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
                <Select
                  label="Frequenza"
                  value={formData.recurrence_frequency}
                  onChange={(event) => setFormData({ ...formData, recurrence_frequency: event.target.value })}
                  options={[
                    { value: "weekly", label: "Settimanale" },
                    { value: "monthly", label: "Mensile" },
                  ]}
                />
                <Input
                  label={formData.recurrence_frequency === "weekly" ? "Ogni quante settimane?" : "Ogni quanti mesi?"}
                  type="number"
                  min="1"
                  max="12"
                  value={formData.recurrence_interval}
                  onChange={(event) => setFormData({ ...formData, recurrence_interval: event.target.value })}
                />
                <Input
                  label="Appuntamenti totali"
                  type="number"
                  min="2"
                  max="52"
                  value={formData.recurrence_occurrences}
                  onChange={(event) => setFormData({ ...formData, recurrence_occurrences: event.target.value })}
                />
                <div className="sm:col-span-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
                  {formData.id === "nuovo" ? "Verranno creati" : "La serie conterrà"} <strong>{formData.recurrence_occurrences || "0"} eventi distinti</strong>
                  {formData.id === "nuovo" ? "." : ", incluso questo."} Ognuno avrà posti, partecipanti, biglietti e scanner indipendenti.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`${currentStep === 3 ? "block" : "hidden"} space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6`}>
        <div className="border-b border-border pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Passaggio 3 di 4</p>
          <h2 className="mt-1 text-xl font-bold">Iscrizioni e dati dei partecipanti</h2>
          <p className="mt-1 text-sm text-slate-500">Configura prezzo, disponibilità e le domande da mostrare durante l’iscrizione.</p>
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

        <div className="border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900">
                Campi personalizzati dei partecipanti <Help text="Le risposte vengono salvate nel biglietto del partecipante e incluse nell’esportazione CSV." />
              </h3>
              <p className="mt-1 text-sm text-slate-500">Chiedi soltanto i dati realmente necessari per questo evento.</p>
            </div>
            <button type="button" onClick={addRegistrationField} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50">
              + Aggiungi campo
            </button>
          </div>

          {formData.registration_fields.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              Nessun campo aggiuntivo. Verranno richiesti soltanto nome ed email.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {formData.registration_fields.map((field, index) => (
                <div key={field.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Campo {index + 1}</span>
                    <button type="button" onClick={() => removeRegistrationField(field.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">Elimina</button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Domanda o etichetta *" placeholder="Es. Livello di esperienza" value={field.label} onChange={(event) => updateRegistrationField(field.id, { label: event.target.value })} />
                    <Select label="Tipo di risposta" value={field.type} onChange={(event) => updateRegistrationField(field.id, { type: event.target.value as RegistrationField["type"], options: event.target.value === "select" ? field.options || [] : undefined })} options={[
                      { value: "text", label: "Testo libero" },
                      { value: "select", label: "Scelta da un elenco" },
                      { value: "checkbox", label: "Conferma sì/no" },
                    ]} />
                    {field.type === "select" && (
                      <div className="sm:col-span-2">
                        <Input label="Opzioni separate da virgola *" placeholder="Principiante, Intermedio, Avanzato" value={(field.options || []).join(", ")} onChange={(event) => updateRegistrationField(field.id, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} />
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={field.required} onChange={(event) => updateRegistrationField(field.id, { required: event.target.checked })} className="size-4 accent-slate-950" />
                      Risposta obbligatoria
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
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

        <div className="grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50">
            <Eye className="size-4" /> Anteprima
          </button>
          {formData.id !== "nuovo" && (
            <>
              <button type="button" onClick={handleDuplicate} disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                <Copy className="size-4" /> Duplica come bozza
              </button>
              <button type="button" onClick={handleExport} disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                <Download className="size-4" /> Esporta partecipanti
              </button>
              <button type="button" onClick={handleCancelAndRefund} disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                <RotateCcw className="size-4" /> Annulla e rimborsa
              </button>
            </>
          )}
        </div>
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

      {previewOpen && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <div className="mx-auto my-8 max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {formData.copertina_url ? (
              <img src={formData.copertina_url} alt="" className="aspect-[21/9] w-full object-cover" />
            ) : <div className="grid aspect-[21/9] place-items-center bg-slate-100 text-sm text-slate-400">Nessuna copertina</div>}
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">{formData.tipo}</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">{italianTitle || "Titolo dell’evento"}</h2>
              <p className="mt-3 text-slate-500">{typeof formData.sottotitolo === "object" ? formData.sottotitolo.it : formData.sottotitolo}</p>
              <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <span><strong>Quando:</strong><br />{formData.data_inizio ? new Date(formData.data_inizio).toLocaleString("it-IT") : "Da definire"}</span>
                <span><strong>Dove:</strong><br />{formData.location || formData.indirizzo || "Da definire"}</span>
                <span><strong>Prezzo:</strong><br />{formData.cta_tipo === "stripe" ? (formData.prezzo_euro ? `€${formData.prezzo_euro}` : "Gratis") : "Gestione esterna"}</span>
                <span><strong>Posti:</strong><br />{formData.capacity || "Illimitati"}</span>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="mt-6 min-h-11 w-full rounded-lg bg-slate-950 px-5 font-semibold text-white">Chiudi anteprima</button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
  const toLocalDateTimeInput = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };
