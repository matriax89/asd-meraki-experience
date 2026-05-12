"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Select, Checkbox } from "@/components/admin/form-elements";
import { upsertProduct } from "@/app/api/admin/prodotti/actions";

interface ProductFormProps {
  initialData: any;
}

export function ProductForm({ initialData }: ProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Convert cents to euros for the UI
  const initialPriceEuro = initialData?.prezzo_base_cents 
    ? (initialData.prezzo_base_cents / 100).toFixed(2) 
    : "";

  const [formData, setFormData] = useState({
    id: initialData?.id || "nuovo",
    nome: initialData?.nome || "",
    slug: initialData?.slug || "",
    categoria: initialData?.categoria || "abbigliamento",
    descrizione_breve: initialData?.descrizione_breve || "",
    descrizione_lunga: initialData?.descrizione_lunga || "",
    prezzo_euro: initialPriceEuro,
    copertina_url: initialData?.copertina_url || "",
    in_vendita: initialData?.in_vendita ?? true,
  });

  const generateSlug = (nome: string) => {
    return nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nome = e.target.value;
    setFormData(prev => ({
      ...prev,
      nome,
      slug: prev.id === "nuovo" ? generateSlug(nome) : prev.slug
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    // Parse euro to cents
    const parsedEuro = parseFloat(formData.prezzo_euro.replace(',', '.'));
    if (isNaN(parsedEuro)) {
      setMessage({ type: 'error', text: "Il prezzo deve essere un numero valido." });
      return;
    }
    const prezzo_base_cents = Math.round(parsedEuro * 100);

    const payload = {
      id: formData.id,
      nome: formData.nome,
      slug: formData.slug,
      categoria: formData.categoria,
      descrizione_breve: formData.descrizione_breve,
      descrizione_lunga: formData.descrizione_lunga,
      prezzo_base_cents,
      copertina_url: formData.copertina_url,
      in_vendita: formData.in_vendita,
    };

    startTransition(async () => {
      const result = await upsertProduct(payload);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Prodotto salvato con successo!' });
        if (formData.id === "nuovo") {
          router.push(`/it/admin/prodotti/${result.id}`);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Dati Principali</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input 
            label="Nome Prodotto *" 
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
          <Select 
            label="Categoria *" 
            required
            options={[
              { value: "abbigliamento", label: "Abbigliamento" },
              { value: "accessori", label: "Accessori" },
              { value: "attrezzatura", label: "Attrezzatura" }
            ]}
            value={formData.categoria}
            onChange={e => setFormData({...formData, categoria: e.target.value})}
          />
          <div className="relative">
            <Input 
              label="Prezzo Base (€) *" 
              required 
              type="text"
              placeholder="es. 29.99"
              value={formData.prezzo_euro} 
              onChange={e => setFormData({...formData, prezzo_euro: e.target.value})} 
            />
          </div>
        </div>

        <Textarea 
          label="Descrizione Breve (Anteprima)" 
          maxLength={200}
          value={formData.descrizione_breve} 
          onChange={e => setFormData({...formData, descrizione_breve: e.target.value})} 
        />
        
        <Textarea 
          label="Descrizione Completa" 
          className="min-h-[150px]"
          value={formData.descrizione_lunga} 
          onChange={e => setFormData({...formData, descrizione_lunga: e.target.value})} 
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-bold border-b border-border pb-2">Media e Visibilità</h2>
        
        <Input 
          label="URL Immagine Principale" 
          placeholder="https://..."
          value={formData.copertina_url} 
          onChange={e => setFormData({...formData, copertina_url: e.target.value})} 
        />
        {formData.copertina_url && (
          <div className="mt-2 w-full max-w-sm rounded-lg overflow-hidden border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formData.copertina_url} alt="Anteprima" className="w-full h-auto object-contain aspect-square" />
          </div>
        )}

        <div className="pt-4">
          <Checkbox 
            label="Prodotto Attivo" 
            description="Se disattivato, non sarà visibile nello shop indipendentemente dallo stock delle varianti."
            checked={formData.in_vendita}
            onChange={e => setFormData({...formData, in_vendita: e.target.checked})}
          />
        </div>
      </div>

      {formData.id !== "nuovo" && (
        <div className="bg-muted border border-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">Varianti (Taglie / Colori)</h2>
            <button type="button" disabled className="text-sm bg-primary/50 text-primary-foreground px-3 py-1.5 rounded cursor-not-allowed">
              Aggiungi Variante (Presto disponibile)
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Per questa prima iterazione, le varianti e lo stock (es. M - Blu - Qty 10) devono essere gestite direttamente dal pannello Supabase nella tabella <code>product_variants</code>.
          </p>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-primary text-primary-foreground font-bold px-8 py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Salvataggio..." : (formData.id === "nuovo" ? "Crea Prodotto" : "Salva Modifiche")}
        </button>
      </div>
    </form>
  );
}
