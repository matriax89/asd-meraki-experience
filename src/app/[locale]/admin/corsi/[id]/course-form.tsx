"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox, MultilingualInput, MultilingualTextarea } from "@/components/admin/form-elements";
import { upsertCourse } from "@/app/api/admin/corsi/actions";
import { compressImageToWebp } from "@/lib/image-utils";
import { uploadImageAction } from "@/app/api/admin/upload/actions";
import { Loader2, Upload, Trash2, Plus } from "lucide-react";
import { useModal } from "@/components/ui/modal-provider";

interface CourseFormProps {
  initialData: any;
  instructors: { id: string; nome: string; cognome: string }[];
  locations: string[];
}

export function CourseForm({ initialData, instructors, locations }: CourseFormProps) {
  const router = useRouter();
  const { showAlert } = useModal();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [scheduleSlots, setScheduleSlots] = useState<any[]>(
    initialData?.schedule_slots || []
  );

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    nome: initialData?.nome || "",
    slug: initialData?.slug || "",
    disciplina: initialData?.disciplina || "",
    descrizione_breve: initialData?.descrizione_breve || "",
    descrizione_completa: initialData?.descrizione_lunga || "",
    livello: initialData?.livello || "",
    durata_minuti: initialData?.durata_minuti || 60,
    frequenza: initialData?.frequenza || "",
    benefici: (() => {
      const b = initialData?.benefici;
      if (!b) return "";
      if (Array.isArray(b)) return b.join(", ");
      if (typeof b === 'object') {
        const it = b.it || b.en || b.de || [];
        return Array.isArray(it) ? it.join(", ") : (typeof it === 'string' ? it : "");
      }
      return typeof b === 'string' ? b : "";
    })(),
    attrezzatura_richiesta: initialData?.attrezzatura_richiesta || "",
    copertina_url: initialData?.copertina_url || "",
    attivo: initialData?.attivo ?? true,
    ordine_display: initialData?.ordine_display || 0,
    instructor_id: initialData?.instructor_id || ""
  });

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleNomeChange = (value: any) => {
    // Generate slug from the 'it' locale if it's a new course
    const itNome = typeof value === 'object' ? (value.it || "") : (typeof value === 'string' ? value : "");
    setFormData(prev => ({
      ...prev,
      nome: value,
      slug: prev.id === "nuovo" ? generateSlug(itNome) : prev.slug // Auto-generate slug solo per i nuovi
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Convert benefits back to array
    const beneficiArray = formData.benefici.split(",").map((b: string) => b.trim()).filter((b: string) => b);

    const payload = {
      ...formData,
      benefici: beneficiArray,
      scheduleSlots: scheduleSlots
    };

    startTransition(async () => {
      const result = await upsertCourse(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Corso salvato con successo!' });
        if (formData.id === "nuovo") {
          router.push(`/it/admin/corsi/${result.id}`);
        }
      }
    });
  };

  const instructorOptions = [
    { value: "", label: "Nessun istruttore" },
    ...instructors.map(i => ({ value: i.id, label: `${i.nome} ${i.cognome}` }))
  ];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const compressedFile = await compressImageToWebp(file);
      const uploadData = new FormData();
      uploadData.append("file", compressedFile);
      
      const res = await uploadImageAction(uploadData);
      if (res.success && res.url) {
        setFormData(prev => ({ ...prev, copertina_url: res.url }));
      } else {
        showAlert({ title: "Errore", message: "Errore caricamento immagine: " + res.error, type: "error" });
      }
    } catch (error: any) {
      showAlert({ title: "Errore", message: "Errore compressione: " + error.message, type: "error" });
    } finally {
      setUploadingImage(false);
    }
  };

  const addScheduleSlot = () => {
    setScheduleSlots([...scheduleSlots, { giorno: "lun", ora_inizio: "18:00", ora_fine: "19:00", sede: locations[0]?.toLowerCase() || "bolzano", attivo: true }]);
  };

  const updateScheduleSlot = (index: number, field: string, value: any) => {
    const newSlots = [...scheduleSlots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setScheduleSlots(newSlots);
  };

  const removeScheduleSlot = (index: number) => {
    setScheduleSlots(scheduleSlots.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Informazioni Principali</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MultilingualInput 
            label="Nome Corso *" 
            required 
            value={formData.nome} 
            onChange={handleNomeChange} 
          />
          <Input 
            label="Slug (URL) *" 
            required 
            value={formData.slug} 
            onChange={e => setFormData({...formData, slug: e.target.value})} 
          />
          <Input 
            label="Disciplina *" 
            required 
            placeholder="es. Yoga, Pilates, Danza"
            value={formData.disciplina} 
            onChange={e => setFormData({...formData, disciplina: e.target.value})} 
          />
          <Select 
            label="Istruttore" 
            options={instructorOptions}
            value={formData.instructor_id}
            onChange={e => setFormData({...formData, instructor_id: e.target.value})}
          />
        </div>

        <MultilingualTextarea 
          label="Descrizione Breve (Anteprima)" 
          maxLength={200}
          value={formData.descrizione_breve} 
          onChange={val => setFormData({...formData, descrizione_breve: val})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Dettagli Approfonditi</h2>
        
        <MultilingualTextarea 
          label="Descrizione Completa" 
          className="min-h-[200px]"
          value={formData.descrizione_completa} 
          onChange={val => setFormData({...formData, descrizione_completa: val})} 
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Input 
            label="Livello" 
            placeholder="es. Base, Avanzato, Tutti i livelli"
            value={formData.livello} 
            onChange={e => setFormData({...formData, livello: e.target.value})} 
          />
          <Input 
            label="Durata (minuti)" 
            type="number"
            value={formData.durata_minuti} 
            onChange={e => setFormData({...formData, durata_minuti: parseInt(e.target.value)})} 
          />
          <Input 
            label="Frequenza" 
            placeholder="es. 2 volte a settimana"
            value={formData.frequenza} 
            onChange={e => setFormData({...formData, frequenza: e.target.value})} 
          />
        </div>

        <Textarea 
          label="Benefici (separati da virgola)" 
          placeholder="Migliora la postura, Tonifica, Rilassa la mente"
          value={formData.benefici} 
          onChange={e => setFormData({...formData, benefici: e.target.value})} 
        />
        
        <Input 
          label="Attrezzatura Richiesta" 
          placeholder="es. Tappetino, Asciugamano, Abbigliamento comodo"
          value={formData.attrezzatura_richiesta} 
          onChange={e => setFormData({...formData, attrezzatura_richiesta: e.target.value})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Media e Visibilità</h2>
        
        <div className="space-y-4">
          <label className="text-sm font-medium text-foreground block">Immagine Copertina</label>
          
          {formData.copertina_url && (
            <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-border relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={formData.copertina_url} alt="Anteprima copertina" className="w-full h-auto object-cover aspect-video" />
            </div>
          )}

          <label className={`flex items-center justify-center bg-muted/50 hover:bg-muted text-foreground w-full py-4 rounded-xl transition-colors cursor-pointer border border-border border-dashed ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="ml-2 font-medium">{uploadingImage ? 'Caricamento in corso...' : (formData.copertina_url ? 'Sostituisci Immagine' : 'Carica Immagine')}</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <Input 
            label="Ordine Display" 
            type="number"
            value={formData.ordine_display} 
            onChange={e => setFormData({...formData, ordine_display: parseInt(e.target.value)})} 
          />
          
          <div className="pt-8">
            <Checkbox 
              label="Corso Attivo" 
              description="Visibile sul sito pubblico."
              checked={formData.attivo}
              onChange={e => setFormData({...formData, attivo: e.target.checked})}
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-xl font-bold">Orari e Sedi (Palinsesto)</h2>
          <button type="button" onClick={addScheduleSlot} className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Aggiungi Orario
          </button>
        </div>
        
        {scheduleSlots.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">Nessun orario configurato per questo corso. Clicca su "Aggiungi Orario" per inserire le lezioni nel palinsesto.</p>
        ) : (
          <div className="space-y-4">
            {scheduleSlots.map((slot, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row items-end gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex-1 min-w-[120px]">
                  <Select 
                    label="Giorno"
                    value={slot.giorno}
                    onChange={(e) => updateScheduleSlot(idx, "giorno", e.target.value)}
                    options={[
                      { value: "lun", label: "Lunedì" },
                      { value: "mar", label: "Martedì" },
                      { value: "mer", label: "Mercoledì" },
                      { value: "gio", label: "Giovedì" },
                      { value: "ven", label: "Venerdì" },
                      { value: "sab", label: "Sabato" },
                      { value: "dom", label: "Domenica" },
                    ]}
                  />
                </div>
                <div className="w-full sm:w-24">
                  <Input 
                    label="Inizio"
                    type="time"
                    required
                    value={slot.ora_inizio ? slot.ora_inizio.substring(0, 5) : ""}
                    onChange={(e) => updateScheduleSlot(idx, "ora_inizio", e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-24">
                  <Input 
                    label="Fine"
                    type="time"
                    required
                    value={slot.ora_fine ? slot.ora_fine.substring(0, 5) : ""}
                    onChange={(e) => updateScheduleSlot(idx, "ora_fine", e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Select 
                    label="Sede"
                    value={slot.sede}
                    onChange={(e) => updateScheduleSlot(idx, "sede", e.target.value)}
                    options={locations.map(loc => ({ value: loc.toLowerCase(), label: loc }))}
                  />
                </div>
                <button 
                  type="button" 
                  onClick={() => removeScheduleSlot(idx)}
                  className="p-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors shrink-0 mb-[2px]"
                  title="Rimuovi orario"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-primary text-primary-foreground font-bold px-8 py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Corso" : "Salva Modifiche")}
        </button>
      </div>
    </form>
  );
}
