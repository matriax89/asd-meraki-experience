"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox } from "@/components/admin/form-elements";
import { upsertSponsor, deleteSponsor } from "@/app/api/admin/sponsors/actions";
import { useModal } from "@/components/ui/modal-provider";

interface SponsorFormProps {
  initialData: any;
}

export function SponsorForm({ initialData }: SponsorFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const { showConfirm } = useModal();

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    nome: initialData?.nome || "",
    descrizione: initialData?.descrizione || "",
    logo_url: initialData?.logo_url || "",
    link: initialData?.link || "",
    tier: initialData?.tier || "",
    ordine_display: initialData?.ordine_display || 0,
    attivo: initialData?.attivo ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const payload = {
      id: formData.id === "nuovo" ? undefined : formData.id,
      nome: formData.nome,
      descrizione: formData.descrizione,
      logo_url: formData.logo_url,
      link: formData.link,
      tier: formData.tier,
      ordine_display: formData.ordine_display,
      attivo: formData.attivo,
    };

    startTransition(async () => {
      const result = await upsertSponsor(payload);
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Errore durante il salvataggio' });
      } else {
        setMessage({ type: 'success', text: 'Sponsor salvato con successo!' });
        router.push("/it/admin/sponsors");
      }
    });
  };

  const handleDelete = async () => {
    const isConfirmed = await showConfirm({
      title: "Elimina Partner",
      message: "Sei sicuro di voler eliminare questo partner? Questa operazione è irreversibile."
    });
    
    if (!isConfirmed) return;
    
    startTransition(async () => {
      const result = await deleteSponsor(formData.id);
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Errore durante l\'eliminazione' });
      } else {
        router.push("/it/admin/sponsors");
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
          <h2 className="text-xl font-bold">Dati Partner</h2>
          {formData.id !== "nuovo" && (
            <button 
              type="button" 
              onClick={handleDelete}
              className="text-sm font-semibold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Elimina Partner
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input 
            label="Nome Partner/Sponsor *" 
            required 
            value={formData.nome} 
            onChange={e => setFormData({...formData, nome: e.target.value})} 
          />
          <Select 
            label="Livello (Tier)" 
            options={[
              { value: "", label: "Nessuno / Base" },
              { value: "Gold", label: "Gold" },
              { value: "Silver", label: "Silver" },
              { value: "Bronze", label: "Bronze" },
              { value: "Main Sponsor", label: "Main Sponsor" },
              { value: "Technical Partner", label: "Technical Partner" }
            ]}
            value={formData.tier}
            onChange={e => setFormData({...formData, tier: e.target.value})}
          />
          <Input 
            label="Sito Web (URL)" 
            placeholder="https://..."
            value={formData.link} 
            onChange={e => setFormData({...formData, link: e.target.value})} 
          />
          <div>
            <Input 
              label="Ordine di visualizzazione" 
              type="number"
              placeholder="es. 1"
              value={formData.ordine_display} 
              onChange={e => setFormData({...formData, ordine_display: parseInt(e.target.value) || 0})} 
            />
            <p className="text-xs text-slate-500 mt-1">Numeri più bassi appaiono per primi (0, 1, 2...)</p>
          </div>
        </div>

        <Textarea 
          label="Descrizione (opzionale)" 
          className="min-h-[100px]"
          value={formData.descrizione} 
          onChange={e => setFormData({...formData, descrizione: e.target.value})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Logo e Visibilità</h2>
        
          <Input 
            label="URL Logo *" 
            required
            placeholder="https://..."
            value={formData.logo_url} 
            onChange={e => setFormData({...formData, logo_url: e.target.value})} 
          />
          <p className="text-xs text-slate-500 mt-1">Consigliato logo in formato PNG con sfondo trasparente.</p>
        {formData.logo_url && (
          <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-4 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.logo_url} alt="Anteprima Logo" className="w-full max-h-32 object-contain" />
          </div>
        )}

        <div className="pt-4">
          <Checkbox 
            label="Mostra nella homepage" 
            description="Se disattivato, il partner verrà nascosto dal sito."
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
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Partner" : "Salva Modifiche")}
        </button>
      </div>
    </form>
  );
}
