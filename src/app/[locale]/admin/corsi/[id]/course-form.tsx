"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox } from "@/components/admin/form-elements";
import { upsertCourse } from "@/app/api/admin/corsi/actions";

interface CourseFormProps {
  initialData: any;
  instructors: { id: string; nome: string; cognome: string }[];
}

export function CourseForm({ initialData, instructors }: CourseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    nome: initialData?.nome || "",
    slug: initialData?.slug || "",
    disciplina: initialData?.disciplina || "",
    descrizione_breve: initialData?.descrizione_breve || "",
    descrizione_completa: initialData?.descrizione_completa || "",
    livello: initialData?.livello || "",
    durata_minuti: initialData?.durata_minuti || 60,
    frequenza: initialData?.frequenza || "",
    benefici: initialData?.benefici?.join(", ") || "",
    attrezzatura_richiesta: initialData?.attrezzatura_richiesta || "",
    copertina_url: initialData?.copertina_url || "",
    attivo: initialData?.attivo ?? true,
    ordine_display: initialData?.ordine_display || 0,
    instructor_id: initialData?.instructor_id || ""
  });

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nome = e.target.value;
    setFormData(prev => ({
      ...prev,
      nome,
      slug: prev.id === "nuovo" ? generateSlug(nome) : prev.slug // Auto-generate slug solo per i nuovi
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Convert benefits back to array
    const beneficiArray = formData.benefici.split(",").map((b: string) => b.trim()).filter((b: string) => b);

    const payload = {
      ...formData,
      benefici: beneficiArray
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
          <Input 
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

        <Textarea 
          label="Descrizione Breve (Anteprima)" 
          maxLength={200}
          value={formData.descrizione_breve} 
          onChange={e => setFormData({...formData, descrizione_breve: e.target.value})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Dettagli Approfonditi</h2>
        
        <Textarea 
          label="Descrizione Completa" 
          className="min-h-[200px]"
          value={formData.descrizione_completa} 
          onChange={e => setFormData({...formData, descrizione_completa: e.target.value})} 
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
        
        <Input 
          label="URL Copertina" 
          placeholder="https://..."
          value={formData.copertina_url} 
          onChange={e => setFormData({...formData, copertina_url: e.target.value})} 
        />
        {formData.copertina_url && (
          <div className="mt-2 w-full max-w-sm rounded-lg overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.copertina_url} alt="Anteprima copertina" className="w-full h-auto object-cover aspect-video" />
          </div>
        )}

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
