"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { upsertEvent, deleteEvent } from "@/app/api/admin/eventi/actions";
import { useModal } from "@/components/ui/modal-provider";

interface EventFormProps {
  initialData: any;
}

export function EventForm({ initialData }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
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
    data_inizio: initialData?.data_inizio ? new Date(initialData.data_inizio).toISOString().slice(0, 16) : "",
    data_fine: initialData?.data_fine ? new Date(initialData.data_fine).toISOString().slice(0, 16) : "",
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
          router.push(`/it/admin/eventi/${result.id}`);
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
        router.push("/it/admin/eventi");
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

        <div className="pt-4">
          <Checkbox 
            label="Pubblica sul sito" 
            description="Se disattivato, non sarà visibile e le prevendite non saranno attive."
            checked={formData.attivo}
            onChange={e => setFormData({...formData, attivo: e.target.checked})}
          />
        </div>
      </div>

      <div className="flex justify-end pt-4 sticky bottom-6 z-10">
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-primary text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-black/20 hover:shadow-black/30"
        >
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Evento" : "Salva Modifiche")}
        </button>
      </div>
    </form>
  );
}
