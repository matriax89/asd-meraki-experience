"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/routing";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { upsertEvent, deleteEvent, sendEventCommunicationToAttendees } from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { Bell, CalendarClock, ImageUp, Loader2, MailWarning, PartyPopper } from "lucide-react";
import { toast } from "sonner";

interface EventFormProps {
  initialData: any;
}

export function EventForm({ initialData }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
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
  });

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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl pb-12">
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col items-stretch gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold">Dati Principali</h2>
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

      {formData.id !== "nuovo" && (
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

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Data, Luogo e Prezzo</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold mb-2">Inizio Evento *</label>
            <input 
              type="datetime-local" 
              required
              value={formData.data_inizio}
              onChange={e => setFormData({...formData, data_inizio: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Fine Evento</label>
            <input 
              type="datetime-local" 
              value={formData.data_fine}
              onChange={e => setFormData({...formData, data_fine: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
            />
          </div>
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
            label="Prezzo (€)" 
            placeholder="Lascia vuoto se gratis. es. 20.00"
            value={formData.prezzo_euro} 
            onChange={e => setFormData({...formData, prezzo_euro: e.target.value})} 
          />
          <Input 
            label="Posti Totali (Capienza)" 
            type="number"
            placeholder="es. 50 (vuoto = illimitati)"
            value={formData.capacity} 
            onChange={e => setFormData({...formData, capacity: e.target.value})} 
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Media e Visibilità</h2>
        
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
          <Checkbox 
            label="Pubblica sul sito" 
            description="Se disattivato, non sarà visibile e le prevendite non saranno attive."
            checked={formData.attivo}
            onChange={e => setFormData({...formData, attivo: e.target.checked})}
          />
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end pt-4 sm:bottom-6">
        <button 
          type="submit" 
          disabled={isPending}
          className="w-full rounded-xl bg-primary px-8 py-4 font-bold text-primary-foreground shadow-lg shadow-black/20 transition-colors hover:bg-primary/90 hover:shadow-black/30 disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Evento" : "Salva Modifiche")}
        </button>
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
